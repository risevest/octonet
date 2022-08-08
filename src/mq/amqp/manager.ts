import { Channel, Connection, connect } from "amqplib";

import { Logger } from "../../logging/logger";

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
   * Create a new AMQP Connection managed through connection manager
   * @param url AMQP url
   * @param logger bunyan logger for octonet errors
   */
  static async connect(url: string, logger: Logger) {
    const conn = await connect(url);
    return new ChannelManager(conn, logger);
  }

  /**
   * Create a managed channel. Failure to create a single channel
   * threatens the health of all the channels
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

    return this.conn.close();
  }
}
