import { Channel, Connection, connect } from "amqplib";
import { interfaces } from "inversify";

import { Logger } from "../../logging/logger";
import { AMQPQueue } from "./queue";

export class ChannelManager {
  private channels: Channel[] = [];
  private connected: boolean;

  constructor(private conn: Connection, logger: Logger) {
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
   * Create a managed channel. Channel creation failure means the entire service needs
   * to be restarted
   */
  createChannel(): Promise<Channel> {
    return new Promise((resolve, reject) => {
      this.conn.createChannel().then(
        chan => {
          this.channels.push(chan);
          resolve(chan);
        },
        err => {
          this.connected = false;
          reject(err);
        }
      );
    });
  }

  /**
   * Create a channel with a lifetime limited to running the given function.
   * @param runner code that uses the channel
   */
  async withChannel(runner: (chan: Channel) => Promise<void>) {
    const channel = await this.conn.createChannel();
    await runner(channel);
    await channel.close();
  }

  /**
   * Close all channels and connections
   */
  async close() {
    if (!this.connected) {
      return;
    }

    for (const chan of this.channels) {
      await chan.close();
    }
  }
}
