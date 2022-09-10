import { Container } from "inversify";
import { Redis } from "ioredis";
import ms from "ms";
import cron, { ScheduledTask } from "node-cron";
import { v4 as uuid } from "uuid";

import { Logger } from "../logging/logger";
import { ExitError, RetryError, retryOnError, retryOnRequest, wrapHandler } from "../retry";
import { Job, getJobs } from "./decorators";
import { RedisQueue } from "./queue";

interface ScheduledJob<T> extends Job<T> {
  task: ScheduledTask;
}

export class JobRunner {
  private jobs: ScheduledJob<any>[];
  private lockID: string;

  /**
   * Set up a job runner to run jobs attached using the cron decorators
   * @param container inversify container to load all jobs
   * @param retries number of times to retry failed queries. set to 0 to run single attempts
   * @param timeout minimum timeout before first retry
   */
  constructor(container: Container, private retries = 3, private timeout = "10s") {
    this.jobs = getJobs(container).map(j => ({ ...j, task: null }));
    this.lockID = uuid();
  }

  /**
   * Schedule the jobs that have been extracted. Will run query job handlers
   * immediately if they have pending jobs on the queue
   * @param redis redis for storing pending jobs
   * @param logger logger to track jobs
   */
  async start(redis: Redis, logger: Logger) {
    for (const j of this.jobs) {
      j.job = wrapHandler(logger, j.job);

      // schedule job for later
      j.task = cron.schedule(j.schedule, () => runJob(redis, this.lockID, this.retries, this.timeout, j));

      // only immediately run if a setup exists.
      if (j.query) {
        const queue = new RedisQueue(j.name, redis, j.retries, j.timeout);
        // we don't need to fill if queue already has items
        await queue.work(j.job);
      }
    }
  }

  /**
   * Cancel all pending scheduled tasks. Bare in mind jobs being run
   * while this method is called will still complete.
   */
  stop() {
    return this.jobs.forEach(j => j.task?.stop());
  }
}

/**
 * Acquire distributed lock
 * @param redis redis instance for managing the locks
 * @param group the shared group name of clients that need the lock
 * @param owner the particular name/ID of the client requesting
 * @param period for how long should the lock be held before automatic expiry
 */
export async function acquireLock(redis: Redis, group: string, owner: string, period: string) {
  const key = `${group}:lock`;
  const res = await redis.set(key, owner, "PX", ms(period), "NX");
  return res !== null;
}

/**
 * Release lock if owner is holding it or it hasn't expired
 * @param redis redis instance for managing the locks
 * @param group the shared group name of clients that need the lock
 * @param owner the particular name/ID of the client requesting
 */
export async function releaseLock(redis: Redis, group: string, owner: string): Promise<boolean> {
  const key = `${group}:lock`;
  const lockID = await redis.get(key);
  if (!lockID || lockID !== owner) {
    return false;
  }

  await redis.del(key);
  return true;
}

/**
 * Run the any given job, supporting parallel execution through distributed locks
 * @param redis redis instancee
 * @param lockID ID to be used for locking
 * @param retries number of retries for query jobs
 * @param timeout minimum timeout between retries for query jobs
 * @param j job to run
 */
export async function runJob<T>(redis: Redis, lockID: string, retries: number, timeout: string, j: Job<T>) {
  const ownsLock = await acquireLock(redis, j.name, lockID, j.maxComputeTime);
  const queue = new RedisQueue(j.name, redis, j.retries, j.timeout);

  // only run queryless jobs and queries if we own the lock
  if (ownsLock) {
    try {
      // run the job directly if there's no query
      if (!j.query) {
        await retryOnRequest(j.retries, j.timeout, () => j.job());
        return;
      }

      // write jobs to queue for safe consumption
      // this entire operation is seen as one atomic op.
      await retryOnError(retries, timeout, async () => {
        const filled = await queue.fill(await j.query());

        if (!filled) {
          throw new Error(`Forcing restart for ${j.name} query. Old job not complete`);
        }
      });
    } catch (err) {
      if ((err instanceof RetryError || err instanceof ExitError) && err.wrapped) {
        throw err.wrapped;
      }
      throw err;
    } finally {
      await releaseLock(redis, j.name, lockID);
    }
  }

  return queue.work(j.job);
}
