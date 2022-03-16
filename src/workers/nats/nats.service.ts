import { connect, JetStreamClient } from "nats";
import { v4 as uuidV4 } from "uuid";

export async function createJetstreamClient(url: string): Promise<JetStreamClient> {
  const natsClient = await connect({ servers: url });
  return await natsClient.jetstream();
}

export class NatsService {
  constructor(private jetstreamClient: JetStreamClient) {}

  async publish(subject: string, message: any): Promise<void> {
    const arrayBuffer = new Uint8Array(Buffer.from(JSON.stringify(message)));
    await this.jetstreamClient.publish(subject, arrayBuffer, { msgID: uuidV4() });
  }
}
