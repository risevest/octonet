import { Channel, Connection, ConsumeMessage, connect } from "amqplib";
import { Container } from "inversify";

import { Logger } from "../../logging/logger";
import { RetryError } from "../../retry";
import { dateReviver } from "../../strings";
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
  private connected = false;
  private conn: Connection;
  private channel: Channel;
  private commands = new Map<string, Function>();
  private generation = 0;
  private consumerTags: Array<{ queue: string; consumer_tag: string }> = [];

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
    } else {
      this.conn = connUrl;
    }

    // Each start() is a new generation. Callbacks from an older generation
    // cannot change health, and each consumer acks on the channel that
    // delivered its message, never on `this.channel`, which a later start()
    // replaces. Delivery tags are channel-scoped: acking an old tag on a new
    // channel is a PRECONDITION_FAILED that closes the new channel.
    const generation = ++this.generation;
    const channel = await this.conn.createChannel();
    this.channel = channel;
    this.consumerTags = [];
    // Not running until every queue below has a confirmed consumer.
    this.connected = false;

    const lose = (err?: Error) => {
      if (this.generation !== generation) {
        return;
      }
      this.connected = false;
      if (err) {
        logger.error(err);
      }
    };

    this.conn.on("error", err => lose(err));
    this.conn.on("close", () => lose());
    // A channel can close while its connection stays up.
    channel.on("error", err => lose(err));
    channel.on("close", () => lose());

    await channel.prefetch(parallel);

    for (const [job, handler] of this.commands.entries()) {
      const queue = job.split(".").join("_").toUpperCase();
      const wrapped = wrapHandler(queue, logger, handler);
      // Awaited, so a failed assert or consume rejects start() instead of
      // becoming an unhandled rejection with no consumer behind it.
      await channel.assertQueue(queue, { durable: true });
      const reply = await channel.consume(queue, async msg => {
        if (msg === null) {
          // the broker cancelled this consumer
          lose();
          return;
        }

        try {
          await wrapped(msg);
          ackOn(channel, msg, logger);
        } catch (err) {
          if (!(err instanceof RetryError)) {
            ackOn(channel, msg, logger);
          }
          // no-op for normal errors
        }
      });
      this.consumerTags.push({ queue, consumer_tag: reply.consumerTag });
    }

    this.connected = true;
  }

  /**
   * Tracks the health status of connection to RabbitMQ. Returns false once
   * the connection or channel is lost, and until start() has registered
   * every consumer.
   */
  isRunning() {
    return this.connected;
  }

  /**
   * The queues this instance holds consumers on, with the broker's consumer
   * tags. Empty until start() has registered them all.
   */
  registrations() {
    return this.consumerTags.slice();
  }

  /**
   * Shutdown all workers
   */
  async stop() {
    // Fence live callbacks first so the closes below don't count as a lost
    // connection. No early return when disconnected: a worker that lost its
    // connection may still hold a channel or connection to close.
    this.generation++;
    this.connected = false;
    this.consumerTags = [];

    try {
      await this.channel?.close();
    } catch {
      // already closed
    }

    try {
      await this.conn?.close();
    } catch {
      // already closed
    }
  }
}

/**
 * Ack on the channel that delivered the message. If that channel is gone the
 * ack is dropped and the broker redelivers the message.
 */
function ackOn(channel: Channel, msg: ConsumeMessage, logger: Logger) {
  try {
    channel.ack(msg);
  } catch (err) {
    logger.error(err, "amqp ack dropped: delivering channel is closed; message will be redelivered");
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
