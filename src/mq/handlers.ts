import { Logger } from "../logging/logger";

/**
 * A function that takes in data and the handler and runs pre or post processing
 * for the handler. Remember to always run the handler using await as it could be
 * async.
 */
export type Middleware = (data: any, handler: Function) => Promise<void>;

/**
 * Merge multiple middleware into a handler applying them from left to right
 * @param handler base handle
 * @param middleware list of middleware for the handler
 * @returns new handler wrapped using middleware
 */
export function collapse(handler: Function, middleware: Middleware[]): Function {
  let l = handler;
  for (const m of middleware) {
    l = (data: any) => m(data, l);
  }

  return l;
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
      logger.error(error);
      throw error;
    }
  };
}

/**
 * Custom error instance to allow handlers request a retry
 */
export class RetryError extends Error {}
