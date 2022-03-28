import { Channel, Connection, connect } from "amqplib";
import { interfaces } from "inversify";

import { Logger } from "../../logging/logger";

export class ConnectionManager {
  private channels: Channel[] = [];
  public connected = true;

  constructor(private conn: Connection, logger: Logger) {
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
   * @param logger logger for errors
   */
  static async connect(url: string, logger: Logger) {
    const conn = await connect(url);
    return new ConnectionManager(conn, logger);
  }

  /**
   * Creates an inversify channel provider ensuring the channel can be managed
   */
  provider(): interfaces.ProviderCreator<Channel> {
    return _context => {
      return () => {
        return new Promise((resolve, reject) => {
          this.conn.createChannel().then(chan => {
            this.channels.push(chan);
            resolve(chan);
          }, reject);
        });
      };
    };
  }

  /**
   * Create a managed channel
   */
  createChannel(): Promise<Channel> {
    return new Promise((resolve, reject) => {
      this.conn.createChannel().then(resolve, reject);
    });
  }

  /**
   * Close all channels and this connection
   */
  async close() {
    if (!this.connected) {
      return;
    }

    for (const chan of this.channels) {
      await chan.close();
    }

    return new Promise((resolve, reject) => {
      this.conn.close().then(resolve, reject);
    });
  }
}
