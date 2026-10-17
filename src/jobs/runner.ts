import { ExitError, RetryError, retryOnRequest, wrapHandler } from "../retry";
import { JobTelemetry, RunOutcome } from "./telemetry";
import { SpanStatusCode, trace } from "@opentelemetry/api";
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
  private telemetry: JobTelemetry;

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
    this.telemetry = new JobTelemetry(redis, this.jobs, logger);

    for (const j of this.jobs) {
      j.job = wrapHandler(logger, j.job);

      // schedule job for later
      j.task = cron.schedule(j.schedule, () =>
        runJob(redis, this.lockID, j, logger, this.telemetry).catch(err => logger.error(err, { job_name: j.name }))
      );

      // only immediately run if a setup exists.
      if (j.query) {
        const queue = new RedisQueue(j.name, redis, j.retries, j.timeout);
        // we don't need to fill if queue already has items
        preruns.push(
          (async () => {
            const items = await queue.work(j.job, logger);
            this.telemetry.recordItems(j.name, items);
          })()
        );
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
 * Run the any given job, supporting parallel execution through distributed locks.
 * Only the lock holder runs the query and records the run; every replica helps
 * work the queue.
 * @param redis redis instancee
 * @param lockID ID to be used for locking
 * @param j job to run
 * @param logger logger to track jobs
 * @param telemetry records run and item metrics when given
 */
export async function runJob<T>(redis: Redis, lockID: string, j: Job<T>, logger: Logger, telemetry?: JobTelemetry) {
  const ownsLock = await acquireLock(redis, j.name, lockID, j.maxComputeTime);
  const queue = new RedisQueue(j.name, redis, j.retries, j.timeout);

  if (!ownsLock) {
    const items = await queue.work(j.job, logger);
    telemetry?.recordItems(j.name, items);
    return;
  }

  return trace.getTracer("@risemaxi/octonet").startActiveSpan(`job ${j.name}`, async span => {
    const startedAt = Date.now();
    let result: RunResult;
    try {
      await telemetry?.recordStart(j.name, startedAt);
    } catch (err) {
      logger.error(err, { job_name: j.name });
    }

    try {
      if (j.query) {
        result = await runQuery(j, queue, logger, telemetry);
      } else {
        await retryOnRequest(j.retries, j.timeout, () => j.job());
        result = { outcome: "success" };
      }
    } catch (err) {
      result = { outcome: "failed", error: unwrap(err) };
    }

    const duration = (Date.now() - startedAt) / 1000;
    span.setAttribute("job.outcome", result.outcome);
    if ("error" in result) {
      span.recordException(result.error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: result.error.message });
    }

    logger.log("job finished", {
      job_name: j.name,
      outcome: result.outcome,
      duration_seconds: duration,
      error: "error" in result ? result.error.message : undefined
    });
    try {
      await telemetry?.recordEnd(j.name, startedAt, result.outcome, duration);
    } catch (err) {
      logger.error(err, { job_name: j.name });
    } finally {
      span.end();
    }

    if ("error" in result) {
      throw result.error;
    }
  });
}

type RunResult =
  | { outcome: Extract<RunOutcome, "success" | "partial"> }
  | { outcome: Exclude<RunOutcome, "success">; error: Error };

/**
 * Fill the queue from the job's query and work it. If the query throws after
 * some items were queued, those items are still worked.
 */
async function runQuery<T>(
  j: Job<T>,
  queue: RedisQueue<T>,
  logger: Logger,
  telemetry?: JobTelemetry
): Promise<RunResult> {
  let queued = 0;
  let error: Error;
  try {
    const filled = await queue.fill(countQueued(await j.query(), n => (queued += n)));
    if (!filled) {
      logger.log("queue not empty, skipped filling it from the query", { job_name: j.name });
    }
  } catch (err) {
    error = unwrap(err);
  }

  if (error && queued === 0) {
    return { outcome: "query_failed", error };
  }

  const items = await queue.work(j.job, logger);
  telemetry?.recordItems(j.name, items);

  if (error) {
    return { outcome: "partial", error };
  }
  return { outcome: items.failed > 0 ? "partial" : "success" };
}

function countQueued<T>(ts: T[] | AsyncGenerator<T[]>, onQueued: (n: number) => void) {
  if (Array.isArray(ts)) {
    return ts;
  }

  return (async function* () {
    for await (const chunk of ts) {
      yield chunk;
      onQueued(chunk.length);
    }
  })();
}

function unwrap(err: any): Error {
  if ((err instanceof RetryError || err instanceof ExitError) && err.wrapped) {
    return err.wrapped;
  }
  return err instanceof Error ? err : new Error(String(err));
}
