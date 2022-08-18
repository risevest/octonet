import { injectable } from "inversify";
import { JSONCodec, JetStreamClient } from "nats";
import { v4 as uuidV4 } from "uuid";

export type PublisherFactory = () => NatsPublisher;

@injectable()
export class NatsPublisher {
  private codec = JSONCodec();

  constructor(private client: JetStreamClient) {}

  async publish(subject: string, data: any): Promise<void> {
    const message = this.codec.encode(data);
    await this.client.publish(subject, message, { msgID: uuidV4() });
  }
}
