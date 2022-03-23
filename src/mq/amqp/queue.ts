import { Channel, Connection } from "amqplib";
import { inject, injectable, interfaces } from "inversify";

import { Logger } from "../../logging/logger";

export const ChannelProviderTag = Symbol.for("ChannelProvider");
export type ChannelProvider = () => Promise<Channel>;

interface BufferEntry {
  queue: string;
  data: any;
}

export class ConnectionManager {
  private channels: Channel[] = [];
  public connected = true;

  constructor(private conn: Connection, logger: Logger) {
    conn.on("error", err => {
      this.connected = false;
      logger.error(err);
    });

    conn.on("close", () => {
      this.connected = false;
    });
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

@injectable()
export class AMQPQueue {
  private internalBuffer: BufferEntry[] = [];
  private chan: Channel;
  @inject(ChannelProviderTag) private provider: ChannelProvider;

  constructor() {
    this.provider().then(chan => {
      this.chan = chan;
      chan.on("drain", async () => {
        while (this.internalBuffer.length !== 0) {
          const top = this.internalBuffer[0];
          const succeeded = await this.internalQueue(top.queue, top.data);

          // break out if we need to wait again
          if (!succeeded) {
            return;
          }

          this.internalBuffer.shift();
        }
      });
    });
  }

  /**
   * Push data to a particular queue, handling serilization and buffering
   * @param queue queue to push to
   * @param data data to write on queue
   */
  async push(queue: string, data: any) {
    const succeded = await this.internalQueue(queue, data);
    // queue for later
    if (!succeded) {
      this.internalBuffer.push({ queue, data });
    }
  }

  private async internalQueue(queue: string, data: any) {
    await this.chan.assertQueue(queue, { durable: true });
    return this.chan.sendToQueue(queue, Buffer.from(JSON.stringify(data)));
  }
}
