import { Container } from "inversify";
import ms from "ms";
import {
  ConsumerUpdateConfig,
  JSONCodec,
  JetStreamManager,
  JetStreamPullSubscription,
  JsMsg,
  NatsConnection,
  consumerOpts,
  nanos
} from "nats";

import { Logger } from "../../logging/logger";
import { RetryError } from "../../retry";
import { dateReviver } from "../../strings";
import { groupDecorator, handlerDecorator, parseHandlers } from "../decorators";
import { DeliveryInfo, collapse } from "../handlers";

export const groupKey = Symbol.for("nats.streams");
export const handlerKey = Symbol.for("nats.streams.subscribers");

const defaultMaxDeliver = 5;
const defaultBackoff = ["10s", "1m", "5m", "15m"];

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
  /**
   * maximum number of times a message is delivered before it is given up on.
   * Defaults to 5
   */
  max_deliver?: number;
  /**
   * delays in `ms` format before each redelivery of a message whose handler threw
   * `RetryError`. The last delay is reused once the list runs out. Defaults to
   * ["10s", "1m", "5m", "15m"]
   */
  backoff?: string[];
}

export class Consumers {
  private streams: Set<string> = new Set();
  private subsribers: Map<string, Function> = new Map();

  constructor(container: Container) {
    const handlers = parseHandlers(container, groupKey, handlerKey);
    handlers.forEach(({ handler_tag, group_tag, handler, group_middleware, handler_middleware }) => {
      const middleware = [...group_middleware, ...handler_middleware];
      this.streams.add(group_tag);
      this.subsribers.set(`${group_tag}.${handler_tag}`, collapse(handler, middleware));
    });
  }

  /**
   * Create subscriptions for the handlers that have been setup.
   * @param nats the nats connection to link with
   * @param cfg configuration for the subscribers
   */
  async start(nats: NatsConnection, logger: Logger, cfg: NatsConfig) {
    const manager = await nats.jetstreamManager();
    const client = nats.jetstream();
    for (const stream of this.streams) {
      await manager.streams.info(stream);
    }

    const ackWait = ms(cfg.timeout);
    const maxDeliver = cfg.max_deliver ?? defaultMaxDeliver;
    const backoff = (cfg.backoff ?? defaultBackoff).map(t => ms(t));

    for (const [topic, handler] of this.subsribers.entries()) {
      const [stream] = topic.split(".");
      const durable = durableName(stream, cfg.namespace, topic);
      const opts = consumerOpts();
      opts.ackExplicit();
      opts.ackWait(ackWait);
      opts.maxDeliver(maxDeliver);
      opts.manualAck();
      opts.deliverNew();
      opts.replayInstantly();
      opts.sample(100);
      opts.filterSubject(topic);
      opts.durable(durable);

      // the client attaches to existing durables as they are, so apply our limits
      await updateDurable(manager, logger, stream, durable, { ack_wait: nanos(ackWait), max_deliver: maxDeliver });

      const sub = await client.pullSubscribe(topic, opts);
      const done = pullSmart(cfg.batch_size, sub);
      const retry = { max_deliver: maxDeliver, backoff };
      runSub(sub, wrapHandler(topic, logger, handler, maxDeliver), done, retry, logger.child({ topic }));

      // first pull 😁
      sub.pull({ batch: cfg.batch_size });
    }
  }
}

export function durableName(stream: string, namespace: string, topic: string) {
  const invalidChars = { ".": "_", "*": "opts", ">": "spread" };
  const safeTopic = topic.replace(/[\.\*\>]/g, c => invalidChars[c]);
  return `${stream}_${namespace}_${safeTopic}`;
}

/**
 * Apply `limits` to an existing durable. Failures are logged rather than thrown so
 * a server that refuses the edit doesn't stop the consumers from starting.
 */
async function updateDurable(
  manager: JetStreamManager,
  logger: Logger,
  stream: string,
  durable: string,
  limits: Pick<ConsumerUpdateConfig, "ack_wait" | "max_deliver">
) {
  try {
    const info = await manager.consumers.info(stream, durable);
    if (info.config.ack_wait !== limits.ack_wait || info.config.max_deliver !== limits.max_deliver) {
      await manager.consumers.update(stream, durable, limits);
    }
  } catch (err) {
    // consumer doesn't exist yet, it'll be created with our limits
    if (err.code === "404") {
      return;
    }

    logger.error(err, { stream, durable, message: "could not apply retry limits to existing durable" });
  }
}

interface RetryPolicy {
  max_deliver: number;
  backoff: number[];
}

async function runSub(
  sub: JetStreamPullSubscription,
  handler: Function,
  done: Function,
  retry: RetryPolicy,
  logger: Logger
) {
  for await (const event of sub) {
    const attempt = event.info.redeliveryCount;
    try {
      await handler(event);
      event.ack();
    } catch (err) {
      if (!(err instanceof RetryError)) {
        event.ack();
      } else if (attempt < retry.max_deliver) {
        event.nak(retryDelay(retry.backoff, attempt));
      } else {
        logger.error(err, { subject: event.subject, attempt, message: "retries exhausted, giving up" });
        event.term();
      }
    } finally {
      done();
    }
  }
}

function retryDelay(backoff: number[], attempt: number) {
  if (backoff.length === 0) {
    return undefined;
  }

  return backoff[Math.min(attempt, backoff.length) - 1];
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

function wrapHandler(topic: string, logger: Logger, handler: Function, maxDeliver: number) {
  const childLogger = logger.child({ topic });
  const codec = JSONCodec(dateReviver);

  return async function (msg: JsMsg) {
    const data = codec.decode(msg.data);
    childLogger.log({ data, subject: msg.subject });
    try {
      const info: DeliveryInfo = { attempt: msg.info.redeliveryCount, max_attempts: maxDeliver };
      await handler(data, info);
    } catch (err) {
      childLogger.error(err, { data, subject: msg.subject });
      throw err;
    }
  };
}
