import { injectable } from "inversify";
import { JSONCodec, JetStreamClient } from "nats";
import { v4 as uuidV4 } from "uuid";

@injectable()
export class Stream<T> {
  private codec = JSONCodec();

  constructor(private name: string, private client: JetStreamClient) {}

  /**
   * Add a data item to the stream.
   * @param path path to attach to stream(${name}.${path}) to routing
   * @param data data to add to the stream
   */
  async add(path: string, data: T): Promise<void> {
    const message = this.codec.encode(data);
    await this.client.publish(`${this.name.toLowerCase()}.${path}`, message, { msgID: uuidV4() });
  }
}
