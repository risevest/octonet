import { BatchObservableResult, Counter, Histogram, Meter, ObservableGauge, metrics } from "@opentelemetry/api";
import parser from "cron-parser";
import { Redis } from "ioredis";
import ms from "ms";

import { Logger } from "../logging/logger";
import { Job } from "./decorators";

export const RUN_OUTCOMES = ["success", "failed", "query_failed", "partial"] as const;
export type RunOutcome = (typeof RUN_OUTCOMES)[number];

export interface ItemCounts {
  success: number;
  failed: number;
}

const DURATION_BUCKETS = [1, 5, 15, 30, 60, 120, 300, 600, 1800, 3600, 7200, 14400];

const CLEAR_RUNNING = `
if redis.call("HGET", KEYS[1], "running") == ARGV[1] then
  redis.call("HSET", KEYS[1], "running", 0)
end`;

export class JobTelemetry {
  private runs: Counter;
  private items: Counter;
  private duration: Histogram;
  private lastStart: ObservableGauge;
  private lastSuccess: ObservableGauge;
  private nextDue: ObservableGauge;
  private runningSince: ObservableGauge;
  private maxComputeTime: ObservableGauge;
  private deadLetter: ObservableGauge;
  private startedAt = Date.now();

  /**
   * Metrics for scheduled jobs. Run times are kept in Redis so replicas agree once
   * a job has run; until then each replica reports its own start time as the last start.
   * @param redis redis holding the run times
   * @param jobs jobs to report on
   * @param logger logs failures to read run times
   * @param meter defaults to the global meter set up by the service's OTel SDK
   */
  constructor(
    private redis: Redis,
    private jobs: Job<any>[],
    private logger: Logger,
    meter: Meter = metrics.getMeter("@risemaxi/octonet")
  ) {
    this.runs = meter.createCounter("job.runs", { description: "Scheduled job runs by outcome" });
    this.items = meter.createCounter("job.items", { description: "Query job items by outcome" });
    this.duration = meter.createHistogram("job.duration", {
      unit: "s",
      description: "Scheduled job run duration",
      advice: { explicitBucketBoundaries: DURATION_BUCKETS }
    });
    this.lastStart = meter.createObservableGauge("job.last_start.timestamp", { unit: "s" });
    this.lastSuccess = meter.createObservableGauge("job.last_success.timestamp", { unit: "s" });
    this.nextDue = meter.createObservableGauge("job.next_due_after_start.timestamp", { unit: "s" });
    this.runningSince = meter.createObservableGauge("job.running_since.timestamp", { unit: "s" });
    this.maxComputeTime = meter.createObservableGauge("job.max_compute_time", { unit: "s" });
    this.deadLetter = meter.createObservableGauge("job.dead_letter.items");

    meter.addBatchObservableCallback(
      result => this.observe(result),
      [this.lastStart, this.lastSuccess, this.nextDue, this.runningSince, this.maxComputeTime, this.deadLetter]
    );

    for (const j of jobs) {
      RUN_OUTCOMES.forEach(outcome => this.runs.add(0, { job_name: j.name, outcome }));
      if (j.query) {
        this.recordItems(j.name, { success: 0, failed: 0 });
      }
    }
  }

  async recordStart(name: string, at: number) {
    await this.redis.hset(stateKey(name), "start", at, "running", at);
  }

  /**
   * Record how a run ended. `startedAt` must be the value given to `recordStart`, so a
   * run that outlived its lock doesn't clear the running time of the run that replaced it.
   */
  async recordEnd(name: string, startedAt: number, outcome: RunOutcome, durationSeconds: number) {
    this.runs.add(1, { job_name: name, outcome });
    this.duration.record(durationSeconds, { job_name: name });

    if (outcome === "success") {
      await this.redis.hset(stateKey(name), "success", Date.now());
    }
    await this.redis.eval(CLEAR_RUNNING, 1, stateKey(name), startedAt);
  }

  recordItems(name: string, counts: ItemCounts) {
    this.items.add(counts.success, { job_name: name, outcome: "success" });
    this.items.add(counts.failed, { job_name: name, outcome: "failed" });
  }

  private async observe(result: BatchObservableResult) {
    const pipeline = this.redis.pipeline();
    for (const j of this.jobs) {
      pipeline.hmget(stateKey(j.name), "start", "success", "running");
      pipeline.hlen(`${j.name}:dead-letter`);
    }

    let replies: [Error | null, unknown][];
    try {
      replies = await pipeline.exec();
    } catch (err) {
      this.logger.error(err, "failed to read job run times");
      return;
    }

    this.jobs.forEach((j, i) => {
      const [stateErr, state] = replies[i * 2];
      const [deadErr, dead] = replies[i * 2 + 1];
      if (stateErr || deadErr) {
        this.logger.error(stateErr ?? deadErr, { job_name: j.name });
        return;
      }

      const [start, success, running] = (state as (string | null)[]).map(v => (v === null ? null : Number(v)));
      const attrs = { job_name: j.name };
      const lastStart = start ?? this.startedAt;

      result.observe(this.lastStart, lastStart / 1000, attrs);
      const nextDue = nextDueAfter(j.schedule, lastStart);
      if (nextDue !== null) {
        result.observe(this.nextDue, nextDue / 1000, attrs);
      }
      result.observe(this.runningSince, (running ?? 0) / 1000, attrs);
      result.observe(this.maxComputeTime, ms(j.maxComputeTime) / 1000, attrs);
      if (success !== null) {
        result.observe(this.lastSuccess, success / 1000, attrs);
      }
      if (j.query) {
        result.observe(this.deadLetter, dead as number, attrs);
      }
    });
  }
}

const MAX_CANDIDATES = 100_000;

/**
 * First scheduled time strictly after `after`, in epoch milliseconds, or null if
 * the schedule never runs.
 * @param schedule cron expression of the job
 * @param after epoch milliseconds to search from
 */
export function nextDueAfter(schedule: string, after: number): number | null {
  let interval: parser.CronExpression;
  try {
    interval = parser.parseExpression(schedule, { currentDate: new Date(after) });
  } catch (err) {
    return null;
  }
  // cron-parser runs when either day field matches, node-cron only when both do
  const days = new Set<number | string>(interval.fields.dayOfMonth);
  const weekdays = new Set<number>(interval.fields.dayOfWeek.map(d => d % 7));

  for (let i = 0; i < MAX_CANDIDATES; i++) {
    const next = interval.next().toDate();
    if (days.has(next.getDate()) && weekdays.has(next.getDay())) {
      return next.getTime();
    }
  }
  return null;
}

function stateKey(name: string) {
  return `${name}:telemetry`;
}
