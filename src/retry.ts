import ms from "ms";

import { Logger } from "./logging/logger";

/**
 * Custom error instance to allow handlers request a retry
 */
export class RetryError extends Error {}

/**
 * Custom error instance to allow functions request a bail out
 * in a retry sequence
 */
export class ExitError extends Error {}

/**
 * Retry a given function based on the configuration on all errors, only
 * bailing out on `ExitError`. This is the simplified version of `node-retry` using
 * exponenetial backoff
 * @param maxRetries maximum number of retries past the first attempt. 0 does not retry
 * at all.
 * @param minTimeout minimum amount of timeout for each attempt. minimum is 1s
 * @param fn function to be retried
 */
export function retryOnError(maxRetries: number, minTimeout: string, fn: () => Promise<void>) {
  if (maxRetries === 0) {
    return fn();
  }

  const timeoutInMS = Math.max(ms(minTimeout), 1000);
  const timeouts = retryTimeouts(maxRetries, timeoutInMS);

  async function run() {
    try {
      await fn();
    } catch (err) {
      if (err instanceof ExitError) {
        return;
      }

      if (timeouts.length === 0) {
        throw err;
      }

      setTimeout(run, timeouts.shift());
    }
  }

  return run();
}

/**
 * Another version of `retryOnError` but it only retries when `RetryError` is thrown.
 * @param maxRetries maximum number of retries past the first attempt. 0 does not retry
 * at all.
 * @param minTimeout minimum amount of timeout for each attempt. minimum is 1s
 * @param fn function to be retried
 */
export async function retryOnRequest(maxRetries: number, minTimeout: string, fn: () => Promise<void>): Promise<void> {
  if (maxRetries === 0) {
    return fn();
  }

  const timeoutInMS = Math.max(ms(minTimeout), 1000);
  const timeouts = retryTimeouts(maxRetries, timeoutInMS);

  async function run() {
    try {
      await fn();
    } catch (err) {
      if (!(err instanceof RetryError)) {
        return;
      }

      if (timeouts.length === 0) {
        throw err;
      }

      setTimeout(run, timeouts.shift());
    }
  }

  return run();
}

/**
 * Create a wrapper function that logs input and errror
 * @param logger octonet logger
 * @param fn function to be wrapped.
 */
export function wrapHandler<T = any>(logger: Logger, fn: (t: T) => Promise<void>) {
  return async function (data: T) {
    logger.log({ data });
    try {
      await fn(data);
    } catch (error) {
      logger.error(error);
      throw error;
    }
  };
}

function retryTimeouts(max: number, timeout: number) {
  return Array.from({ length: max }).map((_, i) => {
    return Math.round(timeout * Math.pow(2, i));
  });
}
