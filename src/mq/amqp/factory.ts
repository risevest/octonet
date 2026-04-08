import { Channel, Connection, Options, connect } from "amqplib";
import ms from "ms";

import { Logger } from "../../logging/logger";
import { Queue } from "./queue";

export class QueueFactory {
  private connected: boolean;
  private queues: Queue<any>[] = [];

  private constructor(private conn: Connection, private channel: Channel, logger: Logger) {
    this.connected = true;

    this.conn.on("error", err => {
      this.connected = false;
      logger.error(err);
    });

    this.conn.on("close", () => {
      this.connected = false;
    });

    // A single drain listener shared across all queues prevents the
    // MaxListenersExceededWarning that occurs when each Queue registers its
    // own listener on the same channel.
    this.channel.on("drain", () => {
      for (const q of this.queues) {
        q.onDrain();
      }
    });

    // Without a channel-level error handler amqplib emits 'error' on the
    // Channel EventEmitter which Node.js escalates to an uncaughtException,
    // leaving the process in an unstable state.
    this.channel.on("error", err => {
      this.connected = false;
      logger.error(err, "AMQP channel error");
    });

    this.channel.on("close", () => {
      this.connected = false;
    });
  }

  /**
   * Create a factory for AMQP queues
   * @param url AMQP url
   * @param logger bunyan logger for errors
   */
  static async connect(url: string, logger: Logger): Promise<QueueFactory>;
  /**
   * Create a factory for AMQP queues
   * @param conn AMQP connection managed externally
   * @param logger bunyan logger for errors
   */
  static async connect(conn: Connection, logger: Logger): Promise<QueueFactory>;
  static async connect(connUrl: string | Connection, logger: Logger) {
    let conn: Connection;
    if (typeof connUrl === "string") {
      conn = await connect(connUrl);
    } else {
      conn = connUrl;
    }

    const channel = await conn.createChannel();
    return new QueueFactory(conn, channel, logger);
  }

  /**
   * Create a queue
   * @param name name of the queue on RabbitMQ
   * @param size maximum number of items(number) or maximum amount of
   * time spent on the queue
   */
  async queue<T>(name: string, size?: number | string) {
    const opts: Options.AssertQueue = { durable: true };
    if (size) {
      if (typeof size === "string") {
        opts.messageTtl = ms(size);
      } else {
        opts.maxLength = Math.abs(size);
      }
    }

    await this.channel.assertQueue(name, opts);
    const q = new Queue<T>(this.channel, name);
    this.queues.push(q);
    return q;
  }

  /**
   * Tracks the health status of connection. Returns false once
   * one connection is lost
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Close the queue connection
   */
  async close() {
    if (!this.connected) {
      return;
    }

    await this.channel.close();
    await this.conn.close();
    return;
  }
}
