import { Channel, Connection, Options, connect } from "amqplib";
import ms from "ms";

import { Logger } from "../../logging/logger";
import { Queue } from "./queue";

export class QueueFactory {
  private connected: boolean;

  private constructor(private conn: Connection, private channel: Channel, logger: Logger) {
    this.connected = true;

    this.conn.on("error", err => {
      this.connected = false;
      logger.error(err);
    });

    this.conn.on("close", () => {
      this.connected = false;
    });
  }

  /**
   * Create a new AMQP Connection managed through connection manager
   * @param url AMQP url
   * @param logger bunyan logger for octonet errors
   */
  static async connect(url: string, logger: Logger) {
    const conn = await connect(url);
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
    return new Queue<T>(this.channel, name);
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
