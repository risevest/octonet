import { Channel } from "amqplib";
import { injectable } from "inversify";

@injectable()
export class Queue<T> {
  private internalBuffer: T[] = [];

  /**
   * Create an abstraction to manage pushing to rabbitmq queues. Assumes the
   * queue has already been setup.
   * @param chan amqp virtual connection
   * @param queue name of the queue
   */
  constructor(private chan: Channel, private queue: string) {
    chan.on("drain", async () => {
      while (this.internalBuffer.length !== 0) {
        const top = Buffer.from(JSON.stringify(this.internalBuffer[0]));
        const succeeded = this.chan.sendToQueue(this.queue, top);

        // break out if we need to wait again
        if (!succeeded) {
          return;
        }

        this.internalBuffer.shift();
      }
    });
  }

  /**
   * Push data to the queue, handling serilization and buffering
   * @param data data to write on queue
   */
  push(data: T) {
    const succeded = this.chan.sendToQueue(this.queue, Buffer.from(JSON.stringify(data)));
    // queue for later
    if (!succeded) {
      this.internalBuffer.push(data);
    }
  }
}
