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

const RECORD_START = `
local start = redis.call("HGET", KEYS[1], "start")
if not start or tonumber(start) < tonumber(ARGV[1]) then
  redis.call("HSET", KEYS[1], "start", ARGV[1], "running", ARGV[1], "items_success", 0, "items_failed", 0)
end`;

const RECORD_ITEMS = `
if ARGV[1] ~= "" then
  local start = redis.call("HGET", KEYS[1], "start")
  if start and tonumber(start) > tonumber(ARGV[1]) then
    return
  end
  if not start or tonumber(start) < tonumber(ARGV[1]) then
    redis.call("HSET", KEYS[1], "start", ARGV[1], "items_success", 0, "items_failed", 0)
  end
end
redis.call("HINCRBY", KEYS[1], "items_success", ARGV[2])
redis.call("HINCRBY", KEYS[1], "items_failed", ARGV[3])`;

const RECORD_END = `
local start = redis.call("HGET", KEYS[1], "start")
if start and tonumber(start) > tonumber(ARGV[1]) then
  return
end
redis.call("HSET", KEYS[1], "start", ARGV[1], "running", 0, "duration", ARGV[2])
if ARGV[3] ~= "" then
  redis.call("HSET", KEYS[1], "success", ARGV[3])
end`;

export class JobTelemetry {
  private runs: Counter;
  private items: Counter;
  private duration: Histogram;
  private lastStart: ObservableGauge;
  private lastSuccess: ObservableGauge;
  private nextDue: ObservableGauge;
  private runningSince: ObservableGauge;
  private lastDuration: ObservableGauge;
  private lastRunItems: ObservableGauge;
  private maxComputeTime: ObservableGauge;
  private deadLetter: ObservableGauge;
  private startedAt = Date.now();
  private observables: ObservableGauge[];
  private callback = (result: BatchObservableResult) => this.observe(result);

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
    private meter: Meter = metrics.getMeter("@risemaxi/octonet")
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
    this.lastDuration = meter.createObservableGauge("job.last_duration", {
      unit: "s",
      description: "How long the most recently finished run took"
    });
    this.lastRunItems = meter.createObservableGauge("job.last_run.items", {
      description: "Items the most recent run worked, by outcome, across all replicas"
    });
    this.maxComputeTime = meter.createObservableGauge("job.max_compute_time", { unit: "s" });
    this.deadLetter = meter.createObservableGauge("job.dead_letter.items", {
      description: "Items in the dead-letter hash: failed items plus items being worked"
    });

    this.observables = [
      this.lastStart,
      this.lastSuccess,
      this.nextDue,
      this.runningSince,
      this.lastDuration,
      this.lastRunItems,
      this.maxComputeTime,
      this.deadLetter
    ];
    meter.addBatchObservableCallback(this.callback, this.observables);

    for (const j of jobs) {
      RUN_OUTCOMES.forEach(outcome => this.runs.add(0, { job_name: j.name, outcome }));
      if (j.query) {
        this.countItems(j.name, { success: 0, failed: 0 });
      }
    }
  }

  /**
   * Stop reporting the gauges, so a replaced instance doesn't keep reading Redis.
   */
  close() {
    this.meter.removeBatchObservableCallback(this.callback, this.observables);
  }

  async recordStart(name: string, at: number) {
    await this.redis.eval(RECORD_START, 1, stateKey(name), at);
  }

  /**
   * Record how a run ended. `startedAt` must be the value given to `recordStart`: a run
   * that outlived its lock and was replaced doesn't overwrite the replacement's run times,
   * and a run whose start write failed still saves its start along with its end.
   */
  async recordEnd(name: string, startedAt: number, outcome: RunOutcome, durationSeconds: number) {
    this.runs.add(1, { job_name: name, outcome });
    this.duration.record(durationSeconds, { job_name: name });

    const success = outcome === "success" ? Date.now() : "";
    await this.redis.eval(RECORD_END, 1, stateKey(name), startedAt, durationSeconds, success);
  }

  /**
   * Count items worked by this replica, and add them to a run's totals in Redis, which
   * `recordStart` resets.
   * @param run which run's totals get the items: the `recordStart` time of the run that worked
   * them (skipped if a newer run has started, and starting that run's totals if its start write
   * was lost), "current" for whichever run is latest, or nothing to leave the totals alone
   */
  async recordItems(name: string, counts: ItemCounts, run?: number | "current") {
    this.countItems(name, counts);
    if (run === undefined) {
      return;
    }
    await this.redis.eval(RECORD_ITEMS, 1, stateKey(name), run === "current" ? "" : run, counts.success, counts.failed);
  }

  private countItems(name: string, counts: ItemCounts) {
    this.items.add(counts.success, { job_name: name, outcome: "success" });
    this.items.add(counts.failed, { job_name: name, outcome: "failed" });
  }

  private async observe(result: BatchObservableResult) {
    const pipeline = this.redis.pipeline();
    for (const j of this.jobs) {
      pipeline.hmget(stateKey(j.name), "start", "success", "running", "duration", "items_success", "items_failed");
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

      const [start, success, running, duration, itemsSuccess, itemsFailed] = (state as (string | null)[]).map(v =>
        v === null ? null : Number(v)
      );
      const attrs = { job_name: j.name };
      const lastStart = start ?? this.startedAt;

      result.observe(this.lastStart, lastStart / 1000, attrs);
      // runJob never releases the lock, so the next run can only start once it expires
      const nextDue = nextDueAfter(j.schedule, start === null ? lastStart : start + ms(j.maxComputeTime) - 1);
      if (nextDue !== null) {
        result.observe(this.nextDue, nextDue / 1000, attrs);
      }
      result.observe(this.runningSince, (running ?? 0) / 1000, attrs);
      result.observe(this.maxComputeTime, ms(j.maxComputeTime) / 1000, attrs);
      if (success !== null) {
        result.observe(this.lastSuccess, success / 1000, attrs);
      }
      if (duration !== null) {
        result.observe(this.lastDuration, duration, attrs);
      }
      if (j.query && itemsSuccess !== null) {
        result.observe(this.lastRunItems, itemsSuccess, { ...attrs, outcome: "success" });
        result.observe(this.lastRunItems, itemsFailed ?? 0, { ...attrs, outcome: "failed" });
      }
      if (j.query) {
        result.observe(this.deadLetter, dead as number, attrs);
      }
    });
  }
}

const MAX_DAYS = 3660;

const toNodeCronFields = loadNodeCronExpansion();

/**
 * node-cron expands names, ranges and steps its own way (e.g. 1-59/2 is the even minutes), so
 * cron-parser reads node-cron's expansion instead of the raw schedule. The expansion isn't public
 * API: if a node-cron upgrade moves it, fall back to the raw schedule rather than fail to load.
 */
function loadNodeCronExpansion(): (schedule: string) => string {
  try {
    return require("node-cron/src/convert-expression");
  } catch (err) {
    return schedule => schedule;
  }
}

/**
 * First scheduled time strictly after `after`, in epoch milliseconds, or null if
 * the schedule never runs.
 * @param schedule cron expression of the job
 * @param after epoch milliseconds to search from
 */
export function nextDueAfter(schedule: string, after: number): number | null {
  let fields: string;
  try {
    fields = toNodeCronFields(schedule);
  } catch (err) {
    return null;
  }

  let from = new Date(after);
  for (let day = 0; day < MAX_DAYS; day++) {
    let interval: parser.CronExpression;
    try {
      interval = parser.parseExpression(fields, { currentDate: from });
    } catch (err) {
      return null;
    }

    const next = interval.next().toDate();
    // cron-parser runs when either day field matches, node-cron only when both do
    const days = new Set<number | string>(interval.fields.dayOfMonth);
    const weekdays = new Set<number>(interval.fields.dayOfWeek.map(d => d % 7));
    if (days.has(next.getDate()) && weekdays.has(next.getDay())) {
      return next.getTime();
    }

    from = new Date(new Date(next.getFullYear(), next.getMonth(), next.getDate() + 1).getTime() - 1);
  }
  return null;
}

function stateKey(name: string) {
  return `${name}:telemetry`;
}
