import { JSONCodec, JetStreamManager } from "nats";
import sinon, { SinonFakeTimers } from "sinon";

import { Channel } from "amqplib";
import crypto from "crypto";
import ms from "ms";
import parser from "cron-parser";
import { promisify } from "util";

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

type JumpFn = (time: string) => void;

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

export async function popFromQueue<T>(channel: Channel, queue: string): Promise<T | null> {
  const result = await channel.get(queue, { noAck: true });
  if (typeof result === "boolean") {
    return null;
  }

  return JSON.parse(result.content.toString());
}

export async function drainQueue(channel: Channel, queue: string): Promise<void> {
  await channel.purgeQueue(queue);
}

export async function getFromStream<T>(manager: JetStreamManager, topic: string) {
  const [stream] = topic.split(".");
  const msg = await manager.streams.getMessage(stream, { last_by_subj: topic });

  return JSONCodec<T>().decode(msg.data);
}

/**
 * Runs the given function while time is reset to the beginning
 * @param f function to be run with paused time. It accepts a function that can be
 * used to jump further
 */
export async function withTimePaused(f: (j: JumpFn) => Promise<void>) {
  sinonClock = sinon.useFakeTimers();
  try {
    await f((t: string) => {
      sinonClock?.tick(ms(t));
    });
  } catch (err) {
    throw err;
  } finally {
    sinonClock?.restore();
    sinonClock = null;
  }
}

/**
 * Jump to specific time and pass it by `extra`. It restores time once you call
 * the `jump` method.
 * @param cronExpr cron expression used to determine where to jump to
 * @param extra how long past the execution time should it jump to
 * @returns a function you call to actually jump time
 */
export function jumpBy(cronExpr: string, extra = "1m", timePeriod?: "past" | "future") {
  timePeriod = timePeriod ?? "past";
  const gap = ms("1m");
  const interval = parser.parseExpression(cronExpr);
  const nextExec = interval.next().toDate();
  const preface = timePeriod === "past" ? new Date(nextExec.getTime() - gap) : new Date(nextExec.getTime() + gap);

  sinonClock = sinon.useFakeTimers(preface);
  const extraTime = gap + ms(extra);

  return async function (ms?: number) {
    sinonClock?.tick(extraTime);
    sinonClock?.restore();
    sinonClock = null;
    if (ms) {
      return sleep(ms);
    }
  };
}
