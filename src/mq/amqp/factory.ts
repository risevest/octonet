import { Channel, Connection, connect } from "amqplib";
import ms from "ms";

import { Logger } from "../../logging/logger";
import { Queue } from "./queue";

export class QueueFactory {
  /**
   * tracks the health status of all connections. Marked false once
   * one connection is lost
   */
  public connected: boolean;

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
  async queue(name: string, size?: number | string) {
    const opts = { durable: true };
    if (size) {
      if (typeof size === "string") {
        opts["messageTtl"] = ms(size);
      } else {
        opts["maxLength"] = Math.abs(size);
      }
    }

    await this.channel.assertQueue(name, opts);
    return new Queue(this.channel, name);
  }

  /**
   * Close all channels and connections
   */
  async close() {
    if (!this.connected) {
      return;
    }

    await this.channel.close();
    return this.conn.close();
  }
}
