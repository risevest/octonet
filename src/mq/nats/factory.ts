import ms from "ms";
import {
  ConnectionOptions,
  DiscardPolicy,
  JetStreamManager,
  NatsConnection,
  NatsError,
  RetentionPolicy,
  StorageType,
  connect
} from "nats";

import { Stream } from "./stream";

export interface BroadcastConfig {
  /**
   * signifies it's a stream for publishing broadcasts that enables us
   * support at-least once delivery
   */
  stream_type: "broadcast";
  /**
   * maximum number of messages to store when that have not been consumed by all
   * consumers. Bear in mind this has an effect on the memory usage of the server so makes
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
        ...streamInfo.config,
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
        retention: RetentionPolicy.Limits,
        discard: DiscardPolicy.Old,
        ...parsedConf
      });
    }

    return new Stream<T>(name, this.conn.jetstream());
  }

  /**
   * Helper for creating broadcast streams
   * @param name name of the stream and prefix for topics
   * @param buffer number of items to hold for disconnected consumers.
   */
  broadcastStream<T>(name: string, buffer = 100) {
    return this.stream<T>(name, { stream_type: "broadcast", buffer_size: buffer });
  }

  /**
   * Helper for creating log stream
   * @param name name of the stream and prefix for topics
   * @param period how long each item should be retained defaults to 1 year
   */
  logStream<T>(name: string, period = "1y") {
    return this.stream<T>(name, { stream_type: "log", retention_period: period });
  }

  /**
   * Returns true is the nats connection still exists. Like `stop` you might not need this
   * unless connection is managed by the factory. Also, keep in mind nats has reconnection
   * mechanisms already
   */
  async isConnected() {
    const err = await this.conn.closed();
    return !err;
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
