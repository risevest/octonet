import { injectable } from "inversify";
import Redis from "ioredis";

import { Logger } from "../logging/logger";
import { retryOnRequest, wrapHandler } from "../retry";

@injectable()
export class RedisQueue<T> {
  /**
   * Creates a redis queue to work jobs in serial order.
   * @param name name of the queue to use to run the job
   * @param redis redis instance to hold job items
   * @param retries number of times to retry failed work calls. set to 0 to run single attempts
   * @param timeout minimum timeout before first retry
   */
  constructor(private name: string, private redis: Redis, private retries = 3, private timeout = "1ms") {}

  /**
   * Fill job queue with work items. It avoids filling the queue if
   * there's still work left.
   * @param ts list of items to add to the queue
   * @returns a boolean signifying whether the items we written to the queue
   */
  async fill(ts: T[]) {
    const length = await this.length();
    if (length > 0) {
      return false;
    }

    const instructions = ts.map(t => ["rpush", this.name, JSON.stringify(t)]);
    await this.redis.multi(instructions).exec();

    return true;
  }

  /**
   * Return the number of items left in the queue
   */
  async length() {
    return await this.redis.llen(this.name);
  }

  /**
   * Run the given function on all the items on the queue
   * @param f function works on each item
   * @param logger optional logger for tracking jobs
   * @param parallelism how many workers should handle the jobs at any given time
   */
  async work(f: (t: T) => Promise<void>, logger?: Logger, parallelism = 1) {
    if (logger) {
      f = wrapHandler(logger, f);
    }

    const work = Array.from({ length: parallelism }).map(async () => {
      while (true) {
        const data = await this.redis.lpop(this.name);
        if (!data) {
          return;
        }

        try {
          await retryOnRequest(this.retries, this.timeout, _n => f(JSON.parse(data)));
        } catch (err) {
          // no-op
        }
      }
    });

    return Promise.all(work);
  }
}
