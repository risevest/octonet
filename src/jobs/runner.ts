import { ExitError, RetryError, retryOnRequest, wrapHandler } from "../retry";
import { Job, getJobs } from "./decorators";
import cron, { ScheduledTask } from "node-cron";

import { Container } from "inversify";
import { Logger } from "../logging/logger";
import { Redis } from "ioredis";
import { RedisQueue } from "./queue";
import ms from "ms";
import { v4 as uuid } from "uuid";

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
  constructor(container: Container) {
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
    const preruns = [];

    for (const j of this.jobs) {
      j.job = wrapHandler(logger, j.job);

      // schedule job for later
      j.task = cron.schedule(j.schedule, () => runJob(redis, this.lockID, j, logger));

      // only immediately run if a setup exists.
      if (j.query) {
        const queue = new RedisQueue(j.name, redis, j.retries, j.timeout);
        // we don't need to fill if queue already has items
        preruns.push(queue.work(j.job));
      }
    }

    await Promise.all(preruns);
    return;
  }

  /**
   * Run a named task manually
   * @param job name of the jub to run
   */
  run(job: string) {
    const task = this.jobs.find(j => j.name === job)?.task;
    if (!task) {
      return;
    }

    // now is not on the TS definitittion
    task["now"]();
  }

  /**
   * Cancel specific or all pending scheduled tasks. Bare in mind jobs being run
   * while this method is called will still complete.
   * @param job name of the job to be stopped
   */
  stop(job?: string) {
    if (!job) {
      return this.jobs.forEach(j => j.task?.stop());
    }

    const task = this.jobs.find(j => j.job.name === job)?.task;
    if (!task) {
      return;
    }

    return task.stop();
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
export async function runJob<T>(redis: Redis, lockID: string, j: Job<T>, logger: Logger) {
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
      await queue.fill(await j.query());
    } catch (err) {
      if ((err instanceof RetryError || err instanceof ExitError) && err.wrapped) {
        throw err.wrapped;
      }
      throw err;
    }
  }

  return queue.work(j.job, logger);
}
