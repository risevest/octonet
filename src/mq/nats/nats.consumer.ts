import { Logger } from "../../logging/logger";
import { consumerOpts, createInbox, JetStreamClient, JsMsg, NatsError } from "nats";
import { natsStreamKey, natsHandlerKey } from "../constants";
import { NatsHandlerMeta, NatsHandlerObject } from "../interfaces";
import { Container } from "inversify";

export const STREAM_GROUP_TAG = Symbol.for("StreamGroup");

export class NatsConsumer {
  private handlerObjects: NatsHandlerObject[] = [];

  constructor(container: Container, private jetstreamClient: JetStreamClient, private logger: Logger) {
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

  async listen() {
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
