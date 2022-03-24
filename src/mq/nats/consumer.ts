import { Container } from "inversify";
import ms from "ms";
import { JSONCodec, JetStreamSubscription, NatsConnection, StorageType, consumerOpts } from "nats";

import { Logger } from "../../logging/logger";
import { groupDecorator, handlerDecorator, parseHandlers } from "../decorators";
import { RetryError, collapse, loggerMiddleware } from "../handlers";

export const groupKey = Symbol.for("nats.streams");
export const handlerKey = Symbol.for("nats.streams.subscribers");

/**
 * Create a stream for all subscriptions starting with `tag`
 * @param tag the name of the stream. It must not contain anything other than a-z.
 * @param middleware optional list of middleware to run on all subscribers
 */
export const stream = groupDecorator(groupKey);
/**
 * Subscribe to an event or wildcard event under a given stream
 * @param tag the subscription topic. Not that this will be prefixed by `$stream.`
 * @param middleware middleware to run on the subscriber. Not that stream middleware are run
 * first
 */
export const subscribe = handlerDecorator(handlerKey);

export interface NatsConfig {
  namespace: string;
  batch_size: number;
  timeout: string;
  backup_size: number;
}

export class NatsConsumer {
  private streams: Set<string> = new Set();
  private subsribers: Map<string, Function> = new Map();

  constructor(container: Container, logger: Logger) {
    const handlers = parseHandlers(container, groupKey, handlerKey);
    handlers.forEach(({ handler_tag, group_tag, handler, group_middleware, handler_middleware }) => {
      const middleware = [loggerMiddleware(logger), ...group_middleware, ...handler_middleware];
      this.streams.add(group_tag);
      this.subsribers.set(`${group_tag}.${handler_tag}`, collapse(handler, middleware));
    });
  }

  /**
   *
   * @param service name of the service running this consumer
   * @param parallilsm
   * @param nats
   */
  async listen(nats: NatsConnection, cfg: NatsConfig) {
    const manager = await nats.jetstreamManager();
    const client = nats.jetstream();
    for (const stream of this.streams) {
      const existing = await safeGet(() => manager.streams.info(stream));
      if (!existing) {
        await manager.streams.add({
          storage: StorageType.Memory,
          subjects: [`${stream}.>`],
          name: stream,
          max_msgs: cfg.backup_size
        });
      } else {
        await manager.streams.update(stream, { max_msgs: cfg.backup_size });
      }
    }

    for (const [topic, handler] of this.subsribers.entries()) {
      const [stream] = topic.split(".");
      const opts = consumerOpts();
      opts.ackExplicit();
      opts.ackWait(ms(cfg.timeout));
      opts.manualAck();

      opts.deliverAll();
      opts.replayInstantly();
      opts.sample(100);

      opts.durable(`${stream}.${cfg.namespace}`);

      const sub = await client.subscribe(topic, opts);
      runSub(sub, handler);
    }
  }
}

async function safeGet<T>(getter: () => Promise<T>) {
  try {
    return await getter();
  } catch (err) {
    return null;
  }
}

async function runSub(sub: JetStreamSubscription, handler: Function) {
  const codec = JSONCodec();
  for await (const event of sub) {
    const data = codec.decode(event.data);
    try {
      await handler(data);
      event.ack();
    } catch (err) {
      if (!(err instanceof RetryError)) {
        event.ack();
      }
    }
  }
}

// function toName(subject: string) {
//   const invalidChars = { ".": "_", "*": "opts", ">": "spread" };
//   return subject.replace(/[\.\*\>]/g, c => invalidChars[c]);
// }

// async function generateConsumerName(manager: JetStreamManager, stream: string, subject: string) {
//   const validName = toName(subject);
//   let count = 0;
//   let consumer = await getConsumer(`${validName}-${count}`);

//   function getConsumer(name: string) {
//     return safeGet(() => manager.consumers.info(stream, name));
//   }
// }
