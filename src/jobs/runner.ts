import { Container } from "inversify";
import { Redis } from "ioredis";
import cron, { ScheduledTask } from "node-cron";

import { Logger } from "../logging/logger";
import { retryOnError, retryOnRequest, wrapHandler } from "../retry";
import { Job, getJobs } from "./decorators";

export class JobRunner {
  private jobs: Job<any>[];
  private tasks: ScheduledTask[];

  /**
   * Set up a job runner to run jobs attached using the cron decorators
   * @param container inversify container to load all jobs
   * @param retries number of times to retry failed queries. set to 0 to run single attempts
   * @param timeout minimum timeout before first retry
   */
  constructor(container: Container, private retries = 3, private timeout = "1ms") {
    this.jobs = getJobs(container);
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
      const task = cron.schedule(j.schedule, async () => {
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

      // track so we can cancel later
      this.tasks.push(task);

      // only immediately run if a setup exists.
      if (j.query) {
        await retryOnRequest(j.retries, j.timeout, () => this.runJob(redis, j));
      }
    }
  }

  stop() {
    return this.tasks.forEach(t => t.stop());
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
