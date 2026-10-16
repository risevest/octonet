import { Channel, Connection, Options, connect } from "amqplib";
import ms from "ms";

import { Logger } from "../../logging/logger";
import { Queue } from "./queue";

/**
 * How long to wait before each attempt to reconnect to RabbitMQ
 */
export const reconnectDelay = ms("5s");

interface AssertedQueue {
  name: string;
  opts: Options.AssertQueue;
  queue: Queue<any>;
}

export class QueueFactory {
  private connected: boolean;
  private closing = false;
  private queues: AssertedQueue[] = [];

  private constructor(
    private conn: Connection,
    private channel: Channel,
    private logger: Logger,
    private url?: string
  ) {
    this.watch(conn);
  }

  /**
   * Create a factory for AMQP queues. The factory reconnects and moves its queues to
   * the new connection when RabbitMQ drops it.
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
    if (typeof connUrl === "string") {
      const conn = await connect(connUrl);
      return new QueueFactory(conn, await conn.createChannel(), logger, connUrl);
    }

    return new QueueFactory(connUrl, await connUrl.createChannel(), logger);
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
    const queue = new Queue<T>(this.channel, name);
    this.queues.push({ name, opts, queue });

    return queue;
  }

  /**
   * Tracks the health status of connection. Returns false while
   * the connection is lost
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Close the queue connection
   */
  async close() {
    this.closing = true;
    if (!this.connected) {
      return;
    }

    await this.channel.close();
    await this.conn.close();
    return;
  }

  private watch(conn: Connection) {
    this.connected = true;

    conn.on("error", err => {
      this.connected = false;
      this.logger.error(err);
    });

    conn.on("close", () => {
      this.connected = false;
      if (this.url && !this.closing) {
        this.reconnect(this.url);
      }
    });
  }

  private reconnect(url: string) {
    setTimeout(async () => {
      if (this.closing) {
        return;
      }

      let conn: Connection | undefined;
      try {
        conn = await connect(url);
        const channel = await conn.createChannel();
        for (const { name, opts, queue } of this.queues) {
          await channel.assertQueue(name, opts);
          queue.useChannel(channel);
        }

        this.conn = conn;
        this.channel = channel;
        this.watch(conn);
        this.logger.log("reconnected the queues to rabbitmq");
      } catch (err) {
        this.logger.error(err);
        conn?.close().catch(() => undefined);
        this.reconnect(url);
      }
    }, reconnectDelay);
  }
}
