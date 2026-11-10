import { Channel, Connection, ConsumeMessage, connect } from "amqplib";
import { Container } from "inversify";
import ms from "ms";

import { Logger } from "../../logging/logger";
import { RetryError } from "../../retry";
import { dateReviver } from "../../strings";
import { groupDecorator, handlerDecorator, parseHandlers } from "../decorators";
import { DeliveryInfo, collapse } from "../handlers";

export const groupKey = Symbol.for("amqp.job.groups");
export const handlerKey = Symbol.for("amqp.job.handler");

const attemptHeader = "x-octonet-attempt";
const defaultMaxAttempts = 5;
const defaultBackoff = ["10s", "1m", "5m", "15m"];

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
 * Configuration for retrying jobs whose handlers throw `RetryError`
 */
export interface RetryConfig {
  /**
   * maximum number of times a job is run before it is moved to its `_DEAD` queue.
   * Defaults to 5
   */
  max_attempts?: number;
  /**
   * delays in `ms` format before each rerun of the job. The last delay is reused
   * once the list runs out. Defaults to ["10s", "1m", "5m", "15m"]
   */
  backoff?: string[];
}

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
   * @param retry how to retry jobs that throw `RetryError`
   */
  async start(url: string, logger: Logger, parallel?: number, retry?: RetryConfig): Promise<void>;
  /**
   * Connect the handlers to their AMQP queues.
   * @param conn AMQP connection managed externally
   * @param logger for keeping track of workers
   * @param parallel how many jobs requests to receive simultaneously
   * @param retry how to retry jobs that throw `RetryError`
   */
  async start(conn: Connection, logger: Logger, parallel?: number, retry?: RetryConfig): Promise<void>;
  async start(connUrl: string | Connection, logger: Logger, parallel = 5, retry: RetryConfig = {}): Promise<void> {
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

    const maxAttempts = retry.max_attempts ?? defaultMaxAttempts;
    const backoff = (retry.backoff ?? defaultBackoff).map(t => ms(t));

    for (const [job, handler] of this.commands.entries()) {
      const queue = job.split(".").join("_").toUpperCase();
      const wrapped = wrapHandler(queue, logger, handler);
      this.channel.assertQueue(queue, { durable: true });
      await this.assertRetryQueues(queue, backoff);

      this.channel.consume(queue, async msg => {
        if (msg === null) {
          return;
        }

        const attempt = (msg.properties.headers?.[attemptHeader] ?? 0) + 1;
        try {
          await wrapped(msg, { attempt, max_attempts: maxAttempts });
        } catch (err) {
          if (err instanceof RetryError) {
            this.requeue(queue, msg, attempt, maxAttempts, backoff, logger);
          }
          // no-op for normal errors
        }

        // retries are copied to another queue, so the original never holds a prefetch slot
        this.channel.ack(msg);
      });
    }
  }

  /**
   * Create the delay queues that send jobs back to `queue` once they expire, and
   * the dead queue for jobs that run out of attempts.
   */
  private async assertRetryQueues(queue: string, backoff: number[]) {
    for (const delay of new Set(backoff)) {
      await this.channel.assertQueue(retryQueue(queue, delay), {
        durable: true,
        messageTtl: delay,
        deadLetterExchange: "",
        deadLetterRoutingKey: queue
      });
    }

    await this.channel.assertQueue(deadQueue(queue), { durable: true });
  }

  private requeue(
    queue: string,
    msg: ConsumeMessage,
    attempt: number,
    maxAttempts: number,
    backoff: number[],
    logger: Logger
  ) {
    let target: string;
    if (attempt >= maxAttempts) {
      target = deadQueue(queue);
      logger.error(new Error("retries exhausted, moving job to dead queue"), { queue, attempt });
    } else if (backoff.length === 0) {
      target = queue;
    } else {
      target = retryQueue(queue, backoff[Math.min(attempt, backoff.length) - 1]);
    }

    const headers = { ...msg.properties.headers, [attemptHeader]: attempt };
    this.channel.sendToQueue(target, msg.content, { headers, persistent: true });
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

function retryQueue(queue: string, delay: number) {
  return `${queue}_RETRY_${delay}`;
}

function deadQueue(queue: string) {
  return `${queue}_DEAD`;
}

function wrapHandler(queue: string, logger: Logger, handler: Function) {
  const childLogger = logger.child({ queue });

  return async function (msg: ConsumeMessage, info: DeliveryInfo) {
    const data = JSON.parse(msg.content.toString(), dateReviver);
    childLogger.log({ data });
    try {
      await handler(data, info);
    } catch (err) {
      childLogger.error(err, { data });
      throw err;
    }
  };
}
