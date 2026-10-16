import { Channel, Connection, ConsumeMessage, connect } from "amqplib";
import { Container } from "inversify";

import { Logger } from "../../logging/logger";
import { RetryError } from "../../retry";
import { dateReviver } from "../../strings";
import { groupDecorator, handlerDecorator, parseHandlers } from "../decorators";
import { collapse } from "../handlers";
import { reconnectDelay } from "./factory";

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
  private stopping = false;
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
   * Connect the handlers to their AMQP queues. The workers reconnect and resume
   * consuming when RabbitMQ drops the connection.
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
      await this.consume(await connect(connUrl), logger, parallel, connUrl);
    } else {
      await this.consume(connUrl, logger, parallel);
    }
  }

  /**
   * Tracks the health status of connection to RabbitMQ. Returns false while
   * the connection is lost
   */
  isRunning() {
    return this.connected;
  }

  /**
   * Shutdown all workers
   */
  async stop() {
    this.stopping = true;
    if (!this.connected) {
      return;
    }

    await this.channel.close();
    await this.conn.close();
    return;
  }

  private async consume(conn: Connection, logger: Logger, parallel: number, url?: string) {
    conn.on("error", err => {
      this.connected = false;
      logger.error(err);
    });

    const channel = await conn.createChannel();
    await channel.prefetch(parallel);

    for (const [job, handler] of this.commands.entries()) {
      const queue = job.split(".").join("_").toUpperCase();
      const wrapped = wrapHandler(queue, logger, handler);
      await channel.assertQueue(queue, { durable: true });
      await channel.consume(queue, async msg => {
        if (msg === null) {
          return;
        }

        try {
          await wrapped(msg);
          channel.ack(msg);
        } catch (err) {
          if (!(err instanceof RetryError)) {
            channel.ack(msg);
          }
          // no-op for normal errors
        }
      });
    }

    this.conn = conn;
    this.channel = channel;
    this.connected = true;

    conn.on("close", () => {
      this.connected = false;
      if (url && !this.stopping) {
        this.reconnect(url, logger, parallel);
      }
    });
  }

  private reconnect(url: string, logger: Logger, parallel: number) {
    setTimeout(async () => {
      if (this.stopping) {
        return;
      }

      let conn: Connection | undefined;
      try {
        conn = await connect(url);
        await this.consume(conn, logger, parallel, url);
        logger.log("reconnected the workers to rabbitmq");
      } catch (err) {
        logger.error(err);
        conn?.close().catch(() => undefined);
        this.reconnect(url, logger, parallel);
      }
    }, reconnectDelay);
  }
}

function wrapHandler(queue: string, logger: Logger, handler: Function) {
  const childLogger = logger.child({ queue });

  return async function (msg: ConsumeMessage) {
    const data = JSON.parse(msg.content.toString(), dateReviver);
    childLogger.log({ data });
    try {
      await handler(data);
    } catch (err) {
      childLogger.error(err, { data });
      throw err;
    }
  };
}
