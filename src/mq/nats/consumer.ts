import { Container } from "inversify";
import ms from "ms";
import { JSONCodec, JetStreamPullSubscription, NatsConnection, consumerOpts } from "nats";

import { Logger } from "../../logging/logger";
import { RetryError } from "../../retry";
import { groupDecorator, handlerDecorator, parseHandlers } from "../decorators";
import { collapse, loggerMiddleware } from "../handlers";

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
/**
 * Configuration for a nats subscriber
 */
export interface NatsConfig {
  /**
   * namespace of all subscriptions in this application
   */
  namespace: string;
  /**
   * maximum number of messages this subscription should request for. Change this
   * based on how fast your subscriber can deal with messages
   */
  batch_size: number;
  /**
   * timeout before retrying the message in `ms` format(e.g. 1m, 2h)
   */
  timeout: string;
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
   * Create subscriptions for the handlers that have been setup.
   * @param nats the nats connection to link with
   * @param cfg configuration for the subscribers
   */
  async listen(nats: NatsConnection, cfg: NatsConfig) {
    const manager = await nats.jetstreamManager();
    const client = nats.jetstream();
    for (const stream of this.streams) {
      await manager.streams.info(stream);
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
      opts.filterSubject(topic);
      opts.durable(consumerName(stream, cfg.namespace, topic));

      const sub = await client.pullSubscribe(topic, opts);
      const done = pullSmart(cfg.batch_size, sub);
      runSub(sub, handler, done);

      // first pull 😁
      sub.pull({ batch: cfg.batch_size });
    }
  }
}

function consumerName(stream: string, namespace: string, topic: string) {
  const invalidChars = { ".": "_", "*": "opts", ">": "spread" };
  const safeTopic = topic.replace(/[\.\*\>]/g, c => invalidChars[c]);
  return `${stream}_${namespace}_${safeTopic}`;
}

async function runSub(sub: JetStreamPullSubscription, handler: Function, done: Function) {
  const codec = JSONCodec();
  for await (const event of sub) {
    const data = codec.decode(event.data);
    try {
      await handler(data);
      event.ack();
      done();
    } catch (err) {
      if (!(err instanceof RetryError)) {
        event.ack();
        done();
      }
    }
  }
}

function pullSmart(batch: number, sub: JetStreamPullSubscription) {
  let count = 0;
  return () => {
    count++;
    if (count === batch) {
      count = 0;
      sub.pull({ batch }); // do this asynchronously so it doesn't interfere with sub
    }
  };
}
