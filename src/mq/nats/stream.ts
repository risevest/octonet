import { injectable } from "inversify";
import { JSONCodec, JetStreamClient } from "nats";
import { v4 as uuidV4 } from "uuid";

@injectable()
export class Stream<T> {
  private codec = JSONCodec();

  constructor(private name: string, private client: JetStreamClient) {}

  async add(path: string, data: T): Promise<void> {
    const message = this.codec.encode(data);
    await this.client.publish(`${this.name.toLowerCase()}.${path}`, message, { msgID: uuidV4() });
  }
}
