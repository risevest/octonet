import { Job, getJobs } from "./decorators";
import cron, { ScheduledTask } from "node-cron";
import { retryOnError, retryOnRequest, wrapHandler } from "../retry";

import { Container } from "inversify";
import { Logger } from "../logging/logger";
import { Redis } from "ioredis";

interface ScheduledJob<T> extends Job<T> {
  task: ScheduledTask;
}

export class JobRunner {
  private jobs: ScheduledJob<any>[];

  /**
   * Set up a job runner to run jobs attached using the cron decorators
   * @param container inversify container to load all jobs
   * @param retries number of times to retry failed queries. set to 0 to run single attempts
   * @param timeout minimum timeout before first retry
   */
  constructor(container: Container, private retries = 3, private timeout = "1ms") {
    this.jobs = getJobs(container).map(j => ({ ...j, task: null }));
  }

  /**
   * Schedule the jobs that have been extracted. Will run query job handlers
   * immediately if they have pending jobs on the queue
   * @param redis redis for storing pending jobs
   * @param logger logger to track jobs
   */
  async start(redis: Redis, logger: Logger) {
    for (const j of this.jobs) {
      j.job = wrapHandler(logger, j.job());

      // schedule job for later
      j.task = cron.schedule(j.schedule, async () => {
        // run the job directly if there's no query
        if (!j.query) {
          return retryOnRequest(this.retries, this.timeout, () => j.job());
        }

        // write jobs to queue for safe consumption
        // this entire operation is seen as one atomic op.
        await retryOnError(this.retries, this.timeout, async () => {
          const jobItems = await j.query();

          const instructions = jobItems.map(t => ["rpush", j.name, JSON.stringify(t)]);
          await redis.multi(instructions).exec();

          return;
        });

        return retryOnRequest(j.retries, j.timeout, () => this.runJob(redis, j));
      });

      // only immediately run if a setup exists.
      if (j.query) {
        await retryOnRequest(j.retries, j.timeout, () => this.runJob(redis, j));
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

  private async runJob<T = any>(redis: Redis, j: Job<T>) {
    const length = await redis.llen(j.name);

    for (let index = 0; index < length; index++) {
      const entries = await redis.lrange(j.name, 0, 0);

      // first empty entry is sign we should skip
      if (entries.length === 0) {
        return;
      }

      const skip = () => redis.lpop(j.name);
      const requeue = () => redis.rpush(j.name, entries[0]);

      const action = await j.job(JSON.parse(entries[0]), skip, requeue);
      switch (action) {
        case "processed":
          await redis.lpop(j.name);
          break;
        case "skipped":
          continue;
        case "requeued":
          await redis.lpop(j.name);
          // adds an additional loop
          index -= 1;
          break;
      }
    }
  }
}
