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
 * @param minTimeout minimum amount of timeout for each attempt
 * @param fn function to be retried
 */
export function retryOnError<T = any>(
  maxRetries: number,
  minTimeout: string,
  fn: (attempt: number) => Promise<T>
): Promise<T> {
  const timeouts = retryTimeouts(maxRetries, ms(minTimeout));
  const shouldRetry = (err: Error) => !(err instanceof ExitError);

  return retry(timeouts, shouldRetry, fn);
}

/**
 * Another version of `retryOnError` but it only retries when `RetryError` is thrown.
 * @param maxRetries maximum number of retries past the first attempt. 0 does not retry
 * at all.
 * @param minTimeout minimum amount of timeout for each attempt
 * @param fn function to be retried
 */
export async function retryOnRequest<T = any>(
  maxRetries: number,
  minTimeout: string,
  fn: (attempt: number) => Promise<T>
): Promise<T> {
  const timeouts = retryTimeouts(maxRetries, ms(minTimeout));
  const shouldRetry = (err: Error) => err instanceof RetryError;

  return retry<T>(timeouts, shouldRetry, fn);
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

function delay<T = any>(t: number, fn: () => Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    setTimeout(async () => {
      try {
        resolve(await fn());
      } catch (err) {
        reject(err);
      }
    }, t);
  });
}

async function retry<T = any>(
  timeouts: number[],
  shouldRetry: (err: Error) => boolean,
  fn: (a: number) => Promise<T>
): Promise<T> {
  if (timeouts.length === 0) {
    return fn(1);
  }

  const copy = [...timeouts];
  async function run() {
    try {
      return await fn(timeouts.length - copy.length + 1);
    } catch (err) {
      if (!shouldRetry(err)) {
        return;
      }

      if (copy.length === 0) {
        throw err;
      }

      return delay(copy.shift(), run);
    }
  }

  return run();
}
