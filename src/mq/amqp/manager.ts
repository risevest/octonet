import { Channel, Connection, connect } from "amqplib";
import { interfaces } from "inversify";

import { Logger } from "../../logging/logger";
import { AMQPQueue } from "./queue";

export type QueueProvider = (name: string) => Promise<AMQPQueue>;

export class ConnectionManager {
  private channels: Channel[] = [];
  private connections = new Map<string, Connection>();
  /**
   * tracks the health status of all connections. Marked false once
   * one connection is lost
   */
  public is_healthy = true;

  constructor(private logger: Logger) {}

  /**
   * Create a new AMQP Connection managed through connection manager
   * @param name name to give this connection for future reference
   * @param url AMQP url
   */
  async connect(name: string, url: string) {
    const conn = await connect(url);

    conn.on("error", err => {
      this.is_healthy = false;
      this.logger.error(err);
    });

    conn.on("close", () => {
      this.is_healthy = false;
      this.logger.error(new Error("Connection with AMQP closed"));
    });

    this.connections.set(name, conn);
  }

  /**
   * Creates an inversify queue provider so it can manage it's lifecycle
   */
  provider(): interfaces.ProviderCreator<AMQPQueue> {
    return _context => {
      return async (name: string) => {
        const channel = await this.createChannel(name);
        return new AMQPQueue(channel);
      };
    };
  }

  /**
   * Create a managed channel
   * @param name name of the connection declared when calling `connect`
   */
  createChannel(name: string): Promise<Channel> {
    if (!this.connections.has(name)) {
      Promise.reject(new Error(`ConnectionManager is not connected to ${name}`));
    }

    const conn = this.connections.get(name);
    return new Promise((resolve, reject) => {
      conn.createChannel().then(chan => {
        this.channels.push(chan);
        resolve(chan);
      }, reject);
    });
  }

  /**
   * Create a channel with a lifetime limited to running the given function.
   * @param name name of connection
   * @param runner code that uses the channel
   */
  async withChannel(name: string, runner: (chan: Channel) => Promise<void>) {
    if (!this.connections.has(name)) {
      throw new Error(`ConnectionManager is not connected to ${name}`);
    }

    const conn = this.connections.get(name);
    const channel = await conn.createChannel();
    await runner(channel);
    await channel.close();
  }

  /**
   * Close all channels and connections
   */
  async close() {
    if (!this.is_healthy) {
      return;
    }

    for (const chan of this.channels) {
      await chan.close();
    }

    for (const conn of this.connections.values()) {
      await conn.close();
    }
  }
}
