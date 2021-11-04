import crypto from "crypto";
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
 * Same as `setTimeout` with promise to wait the timeout out
 * @param delay how long in milliseconds to wait
 */
export const sleep = promisify(setTimeout);
