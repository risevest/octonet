import { injectable } from "inversify";
import ms from "ms";
import {
  ConnectionOptions,
  DiscardPolicy,
  JSONCodec,
  JetStreamClient,
  JetStreamManager,
  NatsConnection,
  NatsError,
  RetentionPolicy,
  StorageType,
  connect
} from "nats";
import { v4 as uuidV4 } from "uuid";

export interface BroadcastConfig {
  /**
   * signifies it's a stream for publishing broadcasts that enables us
   * support at-least once delivery
   */
  stream_type: "broadcast";
  /**
   * maximum number of messages to store when that have not been consumed by all
   * customers. Bear in mind this has an effect on the memory usage of the server so makes
   * sense to keep it small when possible
   */
  buffer_size: number;
}

export interface LogConfig {
  /**
   * signifies it's an actual stream with logged data over a period of time
   */
  stream_type: "log";
  /**
   * how long till each message is deleted
   */
  retention_period: string;
}

export type StreamConfig = BroadcastConfig | LogConfig;

@injectable()
export class Stream<T> {
  private codec = JSONCodec();

  constructor(private name: string, private client: JetStreamClient) {}

  async add(path: string, data: T): Promise<void> {
    const message = this.codec.encode(data);
    await this.client.publish(`${this.name.toLowerCase()}.${path}`, message, { msgID: uuidV4() });
  }
}

export class StreamFactory {
  private constructor(private conn: NatsConnection, private manager: JetStreamManager) {}

  /**
   * Creates a stream factoriy using an existing nats connection
   * @param conn nats connection
   */
  static async init(conn: NatsConnection): Promise<StreamFactory>;
  /**
   * Creates a stream factory and manages the nats connection for streams
   * @param url a nats URL or a list of URLs separated by comma
   * @param opts nats connection options
   */
  static async init(url: string, opts?: ConnectionOptions): Promise<StreamFactory>;
  /**
   * Creates a stream factory and manages the nats connection for streams
   * @param urls a list of urls pointing to nats servers
   * @param opts nats connection options
   */
  static async init(urls: string[], opts?: ConnectionOptions): Promise<StreamFactory>;
  static async init(arg: string | string[] | NatsConnection, opts?: ConnectionOptions) {
    if (typeof arg === "string" || Array.isArray(arg)) {
      const conn = await connect({
        ...opts,
        servers: typeof arg === "string" ? arg.split(",") : arg
      });

      return new StreamFactory(conn, await conn.jetstreamManager());
    } else {
      return new StreamFactory(arg, await arg.jetstreamManager());
    }
  }

  /**
   * Create or sync settings of a stream that clients can push to
   * @param name name of the stream
   * @param conf configuration for the type of stream
   */
  async stream<T>(name: string, conf: StreamConfig) {
    name = name.toLowerCase();
    const parsedConf = {
      // num_replicas: TODO: should be based on number of servers
      max_age: conf.stream_type === "log" ? ms(conf.retention_period) * 1_000_000 : undefined,
      max_msgs: conf.stream_type === "broadcast" ? conf.buffer_size : undefined,
      storage: conf.stream_type === "broadcast" ? StorageType.Memory : StorageType.File
    };

    try {
      const streamInfo = await this.manager.streams.info(name);
      if (streamInfo.config.storage !== parsedConf.storage) {
        throw new Error(
          `The ${name} stream is already defined with a different stream type(${
            conf.stream_type === "log" ? "broadcast" : "log"
          })`
        );
      }

      // just incase buffer size/retention period has changes
      await this.manager.streams.update(name, {
        subjects: [`${name}.>`],
        max_msgs: parsedConf.max_msgs,
        max_age: parsedConf.max_age
      });
    } catch (err) {
      if (!(err instanceof NatsError) || err.message !== "stream not found") {
        throw err;
      }

      // create a new one
      await this.manager.streams.add({
        name,
        subjects: [`${name}.>`],
        ...parsedConf
      });
    }

    return new Stream<T>(name, this.conn.jetstream());
  }

  /**
   * Close the nats connection. Only do this `init` is called with a URL(hence
   * the connection is entirely managed by the stream factory), else it will close
   * a connection that might be in use by others
   */
  stop() {
    return this.conn.close();
  }
}
