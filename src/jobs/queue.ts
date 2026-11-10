import { RetryError, retryOnRequest } from "../retry";

import { ItemCounts } from "./telemetry";
import { Logger } from "../logging/logger";
import Redis from "ioredis";
import crypto from "crypto";
import { dateReviver } from "../strings";
import { injectable } from "inversify";

function backupKey() {
  return crypto.randomBytes(16).toString("hex").slice(0, 32);
}

const JOB_POLL_RETRIES = 1;
const JOB_POLL_TIMEOUT = "3s";

@injectable()
export class RedisQueue<T> {
  private deadLetterHash: string;

  /**
   * Creates a redis queue to work jobs in serial order.
   * @param name name of the queue to use to run the job
   * @param redis redis instance to hold job items
   * @param retries number of times to retry failed work calls. set to 0 to run single attempts
   * @param timeout minimum timeout before first retry
   */
  constructor(private name: string, private redis: Redis, private retries = 3, private timeout = "10s") {
    this.deadLetterHash = `${this.name}:dead-letter`;
  }

  /**
   * Fill job queue with work items. It avoids filling the queue if
   * there's still work left.
   * @param ts list of items to add to the queue
   * @returns a boolean signifying whether the items we written to the queue
   */
  async fill(ts: T[] | AsyncGenerator<T[]>) {
    const length = await this.length();
    if (length > 0) {
      return false;
    }

    if (Array.isArray(ts)) {
      // Handle case when ts is an array
      const instructions = ts.map(t => ["rpush", this.name, JSON.stringify(t)]);
      await this.redis.multi(instructions).exec();
    } else {
      // Handle case when ts is an AsyncGenerator
      for await (const chunk of ts) {
        const instructions = chunk.map(t => ["rpush", this.name, JSON.stringify(t)]);
        await this.redis.multi(instructions).exec();
      }
    }

    return true;
  }

  /**
   * Return the number of items left in the queue
   */
  async length() {
    return await this.redis.llen(this.name);
  }

  /**
   * Put failed jobs back on the queue to be re-processed.
   * @returns true if there were failed jobs
   */
  async requeue() {
    const dead = await this.redis.hvals(this.deadLetterHash);
    if (dead.length === 0) {
      return false;
    }

    await this.redis
      .multi([
        ["del", this.deadLetterHash], // delete hash first
        ...dead.map(v => ["rpush", this.name, v])
      ])
      .exec();
    return true;
  }

  /**
   * Run the given function on all the items on the queue.
   * If nothing is on the queue, it will retry in 3s before backing off. This is so slave workers (if any) wait for the master to fill the queue.
   * @param f function works on each item
   * @param logger optional logger for tracking jobs
   * @param parallelism how many workers should handle the jobs at any given time
   * @param counts updated as each item finishes, so callers keep the counts if a Redis call fails midway
   * @returns how many items this worker processed and how many failed
   */
  async work(
    f: (t: T) => Promise<void>,
    logger?: Logger,
    parallelism = 1,
    counts: ItemCounts = { success: 0, failed: 0 },
    onItem?: (outcome: keyof ItemCounts) => void
  ): Promise<ItemCounts> {
    await retryOnRequest(JOB_POLL_RETRIES, JOB_POLL_TIMEOUT, async (attempt: number) => {
      try {
        let handler: Function;
        if (logger) {
          handler = wrapHandler(this.name, logger, f);
        } else {
          handler = (job: string) => f(JSON.parse(job));
        }

        const work = Array.from({ length: parallelism }).map(async () => {
          while (true) {
            const bkpKey = backupKey();
            const data = await this.redis.lpop(this.name);
            if (!data) {
              throw new RetryError();
            }

            // backup the job item
            await this.redis.hset(this.deadLetterHash, bkpKey, data);

            try {
              await retryOnRequest(this.retries, this.timeout, _n => handler(data));
            } catch (err) {
              counts.failed++;
              onItem?.("failed");
              continue;
            }

            counts.success++;
            onItem?.("success");
            await this.redis.hdel(this.deadLetterHash, bkpKey);
          }
        });

        const errors = await Promise.all(work.map(w => w.catch(err => err)));
        throw errors.find(err => !(err instanceof RetryError)) ?? errors[0];
      } catch (error) {
        if (error instanceof RetryError && attempt >= JOB_POLL_RETRIES) {
          return;
        }

        throw error;
      }
    });

    return counts;
  }
}

function wrapHandler(queue: string, logger: Logger, handler: Function) {
  const childLogger = logger.child({ job_queue: queue });

  return async function (msg: string) {
    const data = JSON.parse(msg, dateReviver);
    childLogger.log({ data });
    try {
      await handler(data);
    } catch (err) {
      childLogger.error(err, { data });
      throw err;
    }
  };
}
