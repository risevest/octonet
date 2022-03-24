import { Channel } from "amqplib";
import { Container } from "inversify";

import { Logger } from "../../logging/logger";
import { groupDecorator, handlerDecorator, parseHandlers } from "../decorators";
import { RetryError, collapse, loggerMiddleware } from "../handlers";

export const groupKey = Symbol.for("amqp.job.groups");
export const handlerKey = Symbol.for("amqp.job.handler");

export const jobs = groupDecorator(groupKey);
export const command = handlerDecorator(handlerKey);

/**
 * Link commandGroups and their corresponding commands to rabbitmq.
 */
export class AMQPWorker {
  private commands = new Map<string, Function>();

  /**
   * Build up the command handlers. Each command runs their group middleware first
   * and then their command middleware, all in LTR.
   * @param container for loading dependencies
   * @param logger for logger middleware
   */
  constructor(container: Container, logger: Logger) {
    const handlers = parseHandlers(container, groupKey, handlerKey);
    handlers.forEach(({ handler_tag: tag, handler, group_middleware, handler_middleware }) => {
      const middleware = [...group_middleware, ...handler_middleware, loggerMiddleware(logger)];
      this.commands.set(tag, collapse(handler, middleware));
    });
  }

  /**
   * Connect the handlers to their AMQP queues.
   * @param channel AMQP channel
   * @param parallel how many jobs requests to receive simultaneously
   */
  async listen(channel: Channel, parallel = 5) {
    await channel.prefetch(parallel);

    for (const [job, handler] of this.commands.entries()) {
      const queue = job.split(".").join("_").toUpperCase();
      channel.assertQueue(queue, { durable: true });
      channel.consume(queue, async msg => {
        if (msg === null) {
          return;
        }

        const data = JSON.parse(msg.content.toString());
        try {
          await handler(data);
          channel.ack(msg);
        } catch (err) {
          if (!(err instanceof RetryError)) {
            channel.ack(msg);
          }
          // no-op for normal errors
        }
      });
    }
  }
}
