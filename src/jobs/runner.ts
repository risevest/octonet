import { Container } from "inversify";
import { Redis } from "ioredis";
import cron from "node-cron";

import { Logger } from "../logging/logger";
import { retryOnError, retryOnRequest, wrapHandler } from "../retry";
import { Job, getJobs } from "./decorators";

export class JobRunner {
  private jobs: Job<any>[];

  /**
   * Set up a job runner to run jobs attached using the cron decorators
   * @param container inversify container to load all jobs
   * @param retries number of times to retry failed jobs. set to 0 to run single attempts
   * @param timeout minimum timeout before first retry
   */
  constructor(container: Container, private retries = 3, private timeout = "10s") {
    this.jobs = getJobs(container);
  }

  async start(redis: Redis, logger: Logger) {
    this.jobs.forEach(j => {
      j.job = wrapHandler(logger, j.job);
      cron.schedule(j.schedule, async () => {
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

        return retryOnRequest(this.retries, this.timeout, () => this.runJob(redis, j));
      });

      // only immediately run if a setup exists.
      if (j.query) {
        return retryOnRequest(this.retries, this.timeout, () => this.runJob(redis, j));
      }
    });
  }

  private async runJob<T = any>(redis: Redis, j: Job<T>) {
    const length = await redis.llen(j.name);
    for (let index = 0; index < length; index++) {
      const entries = await redis.lrange(j.name, -1, -1);

      // first empty entry is sign we should skip
      if (entries.length === 0) {
        return;
      }

      await j.job(JSON.parse(entries[0]));

      // clean it off
      await redis.rpop(j.name);
    }
  }
}
