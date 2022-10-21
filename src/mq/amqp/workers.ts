import { Channel, Connection, ConsumeMessage, connect } from "amqplib";
import { Container } from "inversify";

import { Logger } from "../../logging/logger";
import { RetryError } from "../../retry";
import { groupDecorator, handlerDecorator, parseHandlers } from "../decorators";
import { collapse } from "../handlers";

export const groupKey = Symbol.for("amqp.job.groups");
export const handlerKey = Symbol.for("amqp.job.handler");

/**
 * Declares a class has command handlers
 * @param tag there for decorative reasons
 * @param middleware optional list of middleware to run on all commands
 */
export const worker = groupDecorator(groupKey);
/**
 * Create handler for a queue.
 * @param tag queue name which can either be in dot format (my.queue) or just standard name(MY_QUEUE).
 * all names are uppercased and `.` is converted to `_`
 * @param middleware middleware to run on the subscriber. Not that stream middleware are run
 * first
 */
export const command = handlerDecorator(handlerKey);

/**
 * Link workers and their corresponding commands to rabbitmq.
 */
export class Workers {
  private connected: boolean;
  private conn: Connection;
  private channel: Channel;
  private commands = new Map<string, Function>();

  /**
   * Build up the command handlers. Each command runs their group middleware first
   * and then their command middleware, all in LTR.
   * @param container for loading dependencies
   */
  constructor(container: Container) {
    const handlers = parseHandlers(container, groupKey, handlerKey);
    handlers.forEach(({ handler_tag: tag, handler, group_middleware, handler_middleware }) => {
      const middleware = [...group_middleware, ...handler_middleware];
      this.commands.set(tag, collapse(handler, middleware));
    });
  }

  /**
   * Connect the handlers to their AMQP queues.
   * @param url AMQP connection string
   * @param logger for keeping track of workers
   * @param parallel how many jobs requests to receive simultaneously
   */
  async start(url: string, logger: Logger, parallel?: number): Promise<void>;
  /**
   * Connect the handlers to their AMQP queues.
   * @param conn AMQP connection managed externally
   * @param logger for keeping track of workers
   * @param parallel how many jobs requests to receive simultaneously
   */
  async start(conn: Connection, logger: Logger, parallel?: number): Promise<void>;
  async start(connUrl: string | Connection, logger: Logger, parallel = 5): Promise<void> {
    if (typeof connUrl === "string") {
      this.conn = await connect(connUrl);
      this.conn.on("error", err => {
        logger.error(err);
      });
    } else {
      this.conn = connUrl;
    }

    this.channel = await this.conn.createChannel();
    this.connected = true;

    this.conn.on("error", err => {
      this.connected = false;
      logger.error(err);
    });

    this.conn.on("close", () => {
      this.connected = false;
    });

    await this.channel.prefetch(parallel);

    for (const [job, handler] of this.commands.entries()) {
      const wrapped = wrapHandler(job, logger, handler);
      const queue = job.split(".").join("_").toUpperCase();
      this.channel.assertQueue(queue, { durable: true });
      this.channel.consume(queue, async msg => {
        if (msg === null) {
          return;
        }

        try {
          await wrapped(msg);
          this.channel.ack(msg);
        } catch (err) {
          if (!(err instanceof RetryError)) {
            this.channel.ack(msg);
          }
          // no-op for normal errors
        }
      });
    }
  }

  /**
   * Tracks the health status of connection to RabbitMQ. Returns false once
   * one connection is lost
   */
  isRunning() {
    return this.connected;
  }

  /**
   * Shutdown all workers
   */
  async stop() {
    if (!this.connected) {
      return;
    }

    await this.channel.close();
    await this.conn.close();
    return;
  }
}

function wrapHandler(queue: string, logger: Logger, handler: Function) {
  const childLogger = logger.child({ queue });

  return async function (msg: ConsumeMessage) {
    const data = JSON.parse(msg.content.toString());
    childLogger.log({ data });
    try {
      await handler(data);
    } catch (err) {
      childLogger.error(err, { data });
      throw err;
    }
  };
}
