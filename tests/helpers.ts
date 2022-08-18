import crypto from "crypto";
import { promisify } from "util";

import parser from "cron-parser";
import ms from "ms";
import sinon, { SinonFakeTimers } from "sinon";

let sinonClock: SinonFakeTimers | null;

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

/**
 * Generate multiple version using a mock data function.
 * @param n number of values to generate
 * @param fn mock data function
 */
export function multiply<T>(n: number, fn: () => T): T[] {
  const results: T[] = [];

  for (let i = 0; i < n; i++) {
    results.push(fn());
  }

  return results;
}

/**
 * Run async job `fn` `n` times.
 * @param n number of times to run it
 * @param fn job to run
 */
export async function repeat(n: number, fn: (i?: number) => Promise<any>): Promise<any[]> {
  const jobs = Array.from({ length: n }).map((_x, i) => fn(i));
  return Promise.all(jobs);
}

/**
 * Jump to specific time and pass it by `extra`. It restores time once you call
 * the `jump` method.
 * @param cronExpr cron expression used to determine where to jump to
 * @param extra how long past the execution time should it jump to
 * @returns a function you call to actually jump time
 */
export function jumpBy(cronExpr: string, extra = "1m") {
  const gap = ms("1m");
  const interval = parser.parseExpression(cronExpr);
  const nextExec = interval.next().toDate();
  const preface = new Date(nextExec.getTime() - gap);

  sinonClock = sinon.useFakeTimers(preface);
  const extraTime = gap + ms(extra);

  return function () {
    sinonClock?.tick(extraTime);
    sinonClock?.restore();
    sinonClock = null;
  };
}
