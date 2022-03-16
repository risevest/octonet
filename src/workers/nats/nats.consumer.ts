import { Logger } from "../../logging/logger";
import { connect, consumerOpts, createInbox, JetStreamClient, JsMsg, NatsError } from "nats";
import { natsStreamKey, natsHandlerKey } from "../constants";
import { NatsHandlerMeta, NatsHandlerObject, NatsStreamMeta } from "../interfaces";
import { Container } from "inversify";
import { handler } from "workers/decorators";

export const STREAM_GROUP_TAG = Symbol.for("StreamGroup");

export class NatsConsumer {
  private natsClient;
  private handlerObjects: NatsHandlerObject[] = [];

  constructor(container: Container, private logger: Logger, private jetstreamClient: JetStreamClient) {
    this.jetstreamClient = jetstreamClient;
    const streamMeta = Reflect.getMetadata(natsStreamKey, Reflect) || [];

    streamMeta.forEach(({ stream, constructor }) => {
      const name = constructor.name;
      if (container.isBoundNamed(STREAM_GROUP_TAG, name)) {
        throw new Error("You can't declare stream groups with the same class name");
      }

      container.bind<any>(STREAM_GROUP_TAG).to(constructor).whenTargetNamed(name);

      // setup subscribers
      const methodMeta: NatsHandlerMeta[] = Reflect.getMetadata(natsHandlerKey, constructor);
      methodMeta.forEach(({ event, streamGroup, method }) => {
        const instance = container.getNamed(STREAM_GROUP_TAG, streamGroup);
        const handlerFn = instance[method].bind(instance);
        const fullSubject = !stream ? event : `${stream}.${event}`;

        this.handlerObjects.push({ subject: fullSubject, handlerFunction: handlerFn });
      });
    });
  }

  async listen(url: string) {
    this.natsClient = await connect({ servers: url });
    this.jetstreamClient = await this.natsClient.jetstreamManager();

    for (const handlerObject of this.handlerObjects) {
      const { subject, handlerFunction } = handlerObject;
      const opts = consumerOpts();
      opts.durable("me");
      opts.manualAck();
      opts.ackExplicit();
      opts.deliverTo(createInbox());
      opts.callback(async (err: NatsError, msg: JsMsg) => {
        try {
          msg.ack();
          const decodedMsg = JSON.parse(new TextDecoder().decode(msg.data));
          await handlerFunction(decodedMsg);
        } catch (error) {
          this.logger.error(error);
          this.logger.error(err);
        }
      });

      await this.jetstreamClient.subscribe(subject, opts);
    }
  }
}
