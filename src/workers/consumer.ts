import { Channel, Connection } from "amqplib";
import { EventEmitter } from "events";
import { Container } from "inversify";
import TYPES from "../inversify";
import { Logger } from "../logging";
import { eventGroupKey, eventHandlerKey } from "./constants";
import { HandlerMeta } from "./interfaces";

function queueFromEvent(event: string) {
  return event.split(".").join("_").toUpperCase();
}

function wrapHandler(handler: (arg: any) => Promise<void>, logger: Logger) {
  return async (arg: any) => {
    logger.log({ event: arg });
    try {
      await handler(arg);
    } catch (error) {
      logger.error(error);
    }
  };
}

export class Consumer {
  private emitter = new EventEmitter();
  private events = new Set<string>();
  private channel: Channel;

  constructor(container: Container, logger: Logger) {
    const groupMeta = Reflect.getMetadata(eventGroupKey, Reflect) || [];

    // register event groups for dependency injection
    groupMeta.forEach(({ prefix, constructor }) => {
      const name = constructor.name;
      if (container.isBoundNamed(TYPES.EventGroup, name)) {
        throw new Error("You can't declare event groups with the same class name");
      }

      container.bind<any>(TYPES.EventGroup).to(constructor).whenTargetNamed(name);

      // setup event emitter level listeners
      const methodMeta: HandlerMeta[] = Reflect.getMetadata(eventHandlerKey, constructor);
      methodMeta.forEach(({ event, method, group }) => {
        const instance = container.getNamed(TYPES.EventGroup, group);
        const handlerFn = instance[method].bind(instance);
        const fullEvent = `${prefix}.${event}`;

        this.events.add(fullEvent);

        this.emitter.on(fullEvent, wrapHandler(handlerFn, logger));
      });
    });
  }

  async listen(conn: Connection, parallel = 5) {
    this.channel = await conn.createChannel();

    await this.channel.prefetch(parallel);

    for (const event of [...this.events]) {
      const queue = queueFromEvent(event);
      this.channel.assertQueue(queue, { durable: true });
      this.channel.consume(queue, msg => {
        if (msg === null) {
          return;
        }

        this.channel.ack(msg);
        const data = JSON.parse(msg.content.toString());
        this.emitter.emit(event, data);
      });
    }
  }

  close() {
    return this.channel.close();
  }
}
