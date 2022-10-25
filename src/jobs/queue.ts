import { Logger } from "../logging/logger";
import Redis from "ioredis";
import crypto from "crypto";
import { injectable } from "inversify";
import { retryOnRequest } from "../retry";

function backupKey() {
  return crypto.randomBytes(16).toString("hex").slice(0, 32);
}

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
   * Run the given function on all the items on the queue
   * @param f function works on each item
   * @param logger optional logger for tracking jobs
   * @param parallelism how many workers should handle the jobs at any given time
   */
  async work(f: (t: T) => Promise<void>, logger?: Logger, parallelism = 1, instance?: any) {
    let handler: Function;
    if (instance) {
      f = f.bind(instance);
    }

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
          return;
        }

        // backup the job item
        await this.redis.hset(this.deadLetterHash, bkpKey, data);

        try {
          await retryOnRequest(this.retries, this.timeout, _n => handler(data));
          await this.redis.hdel(this.deadLetterHash, bkpKey);
        } catch (err) {
          // no-op
        }
      }
    });

    return Promise.all(work);
  }
}

function wrapHandler(queue: string, logger: Logger, handler: Function) {
  const childLogger = logger.child({ job_queue: queue });

  return async function (msg: string) {
    const data = JSON.parse(msg);
    childLogger.log({ data });
    try {
      await handler(data);
    } catch (err) {
      childLogger.error(err, { data });
      throw err;
    }
  };
}
