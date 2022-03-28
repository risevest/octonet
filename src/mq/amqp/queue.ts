import { Channel } from "amqplib";
import { inject, injectable } from "inversify";

export const ChannelProviderTag = Symbol.for("ChannelProvider");
export type ChannelProvider = () => Promise<Channel>;

interface BufferEntry {
  queue: string;
  data: any;
}

@injectable()
export class AMQPQueue {
  private internalBuffer: BufferEntry[] = [];
  private chan: Promise<Channel>;

  constructor(@inject(ChannelProviderTag) provider: ChannelProvider) {
    this.chan = provider().then(chan => {
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

      return chan;
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
    const chan = await this.chan;
    await chan.assertQueue(queue, { durable: true });
    return chan.sendToQueue(queue, Buffer.from(JSON.stringify(data)));
  }
}
