import { inject } from "inversify";
import { JSONCodec, JetStreamClient } from "nats";
import { v4 as uuidV4 } from "uuid";

export const Jetsream = Symbol.for("JetstreamClient");

export class NatsPublisher {
  @inject(Jetsream) private client: JetStreamClient;
  private codec = JSONCodec();

  async publish(subject: string, data: any): Promise<void> {
    const message = this.codec.encode(data);
    await this.client.publish(subject, message, { msgID: uuidV4() });
  }
}
