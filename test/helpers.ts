import crypto from "crypto";
import ms from "ms";
import { promisify } from "util";

/**
 * Generates random HEX string
 * @param length lenght of random string
 */
export function randomString(length: number) {
  const rand = crypto.randomBytes(Math.ceil(length / 2));
  return rand.toString("hex").slice(0, length);
}

/**
 * Same as `randomString` but returns a promise.
 * @param length lenght of random string
 */
export const asyncRandomString = promisify<number, string>(randomString);

/**
 * Pause execution until `time` runs out. Equivalent to `Thread.sleep`
 * @param time how long to pause loop in `ms` format
 */
export function timeout(time: string) {
  return new Promise((resolve, _reject) => {
    setTimeout(() => {
      resolve(undefined);
    }, ms(time));
  });
}
