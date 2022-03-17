import { Channel, Connection } from "amqplib";
import { Container } from "inversify";

import { Logger } from "../logging/logger";
import { groupDecorator, handlerDecorator, parseHandlers } from "./decorators";

const groupKey = Symbol.for("amqp.job.groups");
const handlerKey = Symbol.for("amqp.job.handler");

export const jobs = groupDecorator(groupKey);
export const handler = handlerDecorator(handlerKey);

function wrapHandler(handler: Function, logger: Logger) {
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
  private handlers = new Map<string, Function>();
  private channel: Channel;

  constructor(container: Container, logger: Logger) {
    const handlers = parseHandlers(container, groupKey, handlerKey);
    handlers.forEach(({ method_tag, handler }) => {
      this.handlers.set(method_tag, wrapHandler(handler, logger));
    });
  }

  async listen(conn: Connection, parallel = 5) {
    this.channel = await conn.createChannel();

    await this.channel.prefetch(parallel);

    for (const [job, handler] of this.handlers.entries()) {
      const queue = job.split(".").join("_").toUpperCase();
      this.channel.assertQueue(queue, { durable: true });
      this.channel.consume(queue, msg => {
        if (msg === null) {
          return;
        }

        this.channel.ack(msg);
        const data = JSON.parse(msg.content.toString());
        handler(data);
      });
    }
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      return this.channel.close().then(resolve, reject);
    });
  }
}
