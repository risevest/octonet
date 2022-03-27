import { inject, injectable, interfaces } from "inversify";
import { JSONCodec, JetStreamClient, NatsConnection } from "nats";
import { v4 as uuidV4 } from "uuid";

export const JSClientFactoryTag = Symbol.for("JSClientFactory");
export type JSClientFactory = () => JetStreamClient;

@injectable()
export class NatsPublisher {
  private client: JetStreamClient;
  private codec = JSONCodec();

  constructor(@inject(JSClientFactoryTag) clientFactory: JSClientFactory) {
    this.client = clientFactory();
  }

  async publish(subject: string, data: any): Promise<void> {
    const message = this.codec.encode(data);
    await this.client.publish(subject, message, { msgID: uuidV4() });
  }
}

/**
 * Connect nats to inversify for the sake of creating jetstream clients
 * @param conn nats connection
 */
export function jSClientFactory(conn: NatsConnection): interfaces.FactoryCreator<JetStreamClient> {
  return _context => {
    return () => {
      return conn.jetstream();
    };
  };
}
