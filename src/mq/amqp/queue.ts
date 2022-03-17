import { Channel } from "amqplib";
import { inject, injectable } from "inversify";

export const ChannelFactory = Symbol.for("AMQPChannel");

interface BufferEntry {
  queue: string;
  data: any;
}

@injectable()
export class AMQPQueue {
  private internalBuffer: BufferEntry[] = [];
  private chan: Channel;
  @inject(ChannelFactory) private factory: () => Promise<Channel>;

  constructor() {
    this.factory().then(chan => {
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
