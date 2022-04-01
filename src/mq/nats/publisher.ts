import { interfaces } from "inversify";
import { JSONCodec, JetStreamClient, NatsConnection } from "nats";
import { v4 as uuidV4 } from "uuid";

export type PublisherFactory = () => NatsPublisher;

export class NatsPublisher {
  private codec = JSONCodec();

  constructor(private client: JetStreamClient) {}

  async publish(subject: string, data: any): Promise<void> {
    const message = this.codec.encode(data);
    await this.client.publish(subject, message, { msgID: uuidV4() });
  }
}

/**
 * Inversify factory for creating nats publishers
 * @param conn nats connection
 */
export function publisherFactory(conn: NatsConnection): interfaces.FactoryCreator<NatsPublisher> {
  return _context => {
    return () => {
      return new NatsPublisher(conn.jetstream());
    };
  };
}
