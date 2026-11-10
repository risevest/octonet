import { Logger } from "../logging/logger";

/**
 * A function that takes in data and the handler and runs pre or post processing
 * for the handler. Remember to always run the handler using await as it could be
 * async.
 */
export type Middleware = (data: any, handler: Function) => Promise<void>;

/**
 * Details of the current delivery, passed to handlers as their second argument
 */
export interface DeliveryInfo {
  /**
   * which delivery this is, starting from 1
   */
  attempt: number;
  /**
   * the last attempt before the message is given up on
   */
  max_attempts: number;
}

/**
 * Merge multiple middleware into a handler applying them from left to right
 * @param handler base handle
 * @param middleware list of middleware for the handler
 * @returns new handler wrapped using middleware. It accepts the delivery info as a
 * second argument and passes it to `handler` untouched by middleware
 */
export function collapse(handler: Function, middleware: Middleware[]): Function {
  if (middleware.length === 0) {
    return handler;
  }

  const final = middleware.reduce(
    (a, b) => async (data, handler) =>
      a(data, async (data: any) => {
        await b(data, handler);
      })
  );

  return (data: any, info?: DeliveryInfo) => final(data, (data: any) => handler(data, info));
}

/**
 * Logs job as `data` and errors if the handler fails.
 * @param logger octonet logger
 */
export function loggerMiddleware(logger: Logger): Middleware {
  return async (data: any, handler: Function) => {
    logger.log({ data });
    try {
      await handler(data);
    } catch (error) {
      logger.error(error, { data });
      throw error;
    }
  };
}
