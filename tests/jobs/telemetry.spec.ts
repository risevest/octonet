import { faker } from "@faker-js/faker";
import { expect } from "chai";
import IORedis, { Redis } from "ioredis";
import ms from "ms";
import sinon from "sinon";

import { Job } from "../../src/jobs/decorators";
import { Logger, defaultSerializers } from "../../src";
import { JobTelemetry, RUN_OUTCOMES, nextDueAfter } from "../../src/jobs/telemetry";
import { collect, testMeter } from "./helpers/metrics";

const redisURL = "redis://localhost:6379";
const logger = new Logger({ name: "telemetry.tests", serializers: defaultSerializers(), verbose: false });
let redis: Redis;

beforeAll(() => {
  redis = new IORedis(redisURL);
});

afterEach(() => redis.flushdb());

afterAll(() => redis.quit());

function randomJob(query = false): Job<number> {
  const minute = faker.datatype.number({ min: 0, max: 59 });
  const hour = faker.datatype.number({ min: 0, max: 23 });
  return {
    name: `group.${faker.lorem.word()}_${faker.datatype.uuid()}`,
    schedule: `${minute} ${hour} * * *`,
    retries: 0,
    timeout: "10ms",
    maxComputeTime: `${faker.datatype.number({ min: 1, max: 120 })}m`,
    job: async () => {},
    query: query ? async () => [] : undefined
  };
}

describe("nextDueAfter", () => {
  it("returns the next daily run strictly after the given time", () => {
    for (let i = 0; i < 50; i++) {
      const minute = faker.datatype.number({ min: 0, max: 59 });
      const hour = faker.datatype.number({ min: 0, max: 23 });
      const after = faker.date.between("2020-01-01", "2030-01-01").getTime();

      const expected = new Date(after);
      expected.setHours(hour, minute, 0, 0);
      if (expected.getTime() <= after) {
        expected.setDate(expected.getDate() + 1);
      }

      expect(nextDueAfter(`${minute} ${hour} * * *`, after)).to.eq(expected.getTime());
    }
  });

  it("returns the next step for frequent jobs", () => {
    for (let i = 0; i < 50; i++) {
      const step = faker.datatype.number({ min: 1, max: 30 });
      const after = faker.date.between("2020-01-01", "2030-01-01").getTime();

      const expected = new Date(after);
      expected.setSeconds(0, 0);
      do {
        expected.setMinutes(expected.getMinutes() + 1);
      } while (expected.getMinutes() % step !== 0);

      expect(nextDueAfter(`*/${step} * * * *`, after)).to.eq(expected.getTime());
    }
  });

  it("reads a 6-field schedule with seconds first, like node-cron", () => {
    const second = faker.datatype.number({ min: 0, max: 59 });
    const minute = faker.datatype.number({ min: 0, max: 59 });
    const hour = faker.datatype.number({ min: 0, max: 23 });
    const after = faker.date.between("2020-01-01", "2030-01-01").getTime();

    const expected = new Date(after);
    expected.setHours(hour, minute, second, 0);
    if (expected.getTime() <= after) {
      expected.setDate(expected.getDate() + 1);
    }

    expect(nextDueAfter(`${second} ${minute} ${hour} * * *`, after)).to.eq(expected.getTime());
  });

  it("needs both day fields to match when both are set, like node-cron", () => {
    for (let i = 0; i < 20; i++) {
      const minute = faker.datatype.number({ min: 0, max: 59 });
      const hour = faker.datatype.number({ min: 0, max: 23 });
      const day = faker.datatype.number({ min: 1, max: 28 });
      const weekday = faker.datatype.number({ min: 0, max: 6 });
      const after = faker.date.between("2020-01-01", "2030-01-01").getTime();

      const expected = new Date(after);
      expected.setHours(hour, minute, 0, 0);
      while (expected.getTime() <= after || expected.getDate() !== day || expected.getDay() !== weekday) {
        expected.setDate(expected.getDate() + 1);
      }

      expect(nextDueAfter(`${minute} ${hour} ${day} * ${weekday}`, after)).to.eq(expected.getTime());
    }
  });

  it("returns null for a schedule that never runs", () => {
    const after = faker.date.between("2020-01-01", "2030-01-01").getTime();
    const day = faker.datatype.number({ min: 30, max: 31 });

    expect(nextDueAfter(`0 0 ${day} 2 *`, after)).to.be.null;
  });

  it("moves past a start exactly on the scheduled time", () => {
    const minute = faker.datatype.number({ min: 0, max: 59 });
    const due = new Date(faker.date.between("2020-01-01", "2030-01-01"));
    due.setMinutes(minute, 0, 0);

    expect(nextDueAfter(`${minute} * * * *`, due.getTime())).to.eq(due.getTime() + ms("1h"));
  });
});

describe("JobTelemetry", () => {
  it("creates every outcome series at 0 when jobs register", async () => {
    const jobs = [randomJob(), randomJob(true)];
    const { meter, reader } = testMeter();
    new JobTelemetry(redis, jobs, logger, meter);

    const points = await collect(reader);
    for (const j of jobs) {
      for (const outcome of RUN_OUTCOMES) {
        const [point] = points("job.runs", { job_name: j.name, outcome });
        expect(point.value).to.eq(0);
      }
    }

    const [simple, query] = jobs;
    expect(points("job.items", { job_name: simple.name })).to.have.length(0);
    expect(points("job.items", { job_name: query.name, outcome: "success" })[0].value).to.eq(0);
    expect(points("job.items", { job_name: query.name, outcome: "failed" })[0].value).to.eq(0);
  });

  it("uses the worker start time for a job that has never started", async () => {
    const j = randomJob();
    const { meter, reader } = testMeter();
    const before = Date.now();
    new JobTelemetry(redis, [j], logger, meter);
    const after = Date.now();

    const points = await collect(reader);
    const [lastStart] = points("job.last_start.timestamp", { job_name: j.name });
    const [nextDue] = points("job.next_due_after_start.timestamp", { job_name: j.name });

    expect(lastStart.value * 1000).to.be.within(before, after);
    expect(nextDue.value).to.eq(nextDueAfter(j.schedule, lastStart.value * 1000) / 1000);
    expect(points("job.last_success.timestamp", { job_name: j.name })).to.have.length(0);
    expect(points("job.running_since.timestamp", { job_name: j.name })[0].value).to.eq(0);
    expect(points("job.max_compute_time", { job_name: j.name })[0].value).to.eq(ms(j.maxComputeTime) / 1000);
  });

  it("reads run times back from redis after a restart", async () => {
    const j = randomJob();
    const startedAt = faker.date.recent(10).getTime();

    const first = new JobTelemetry(redis, [j], logger, testMeter().meter);
    await first.recordStart(j.name, startedAt);

    const running = testMeter();
    new JobTelemetry(redis, [j], logger, running.meter);
    let points = await collect(running.reader);
    expect(points("job.running_since.timestamp", { job_name: j.name })[0].value).to.eq(startedAt / 1000);

    const beforeEnd = Date.now();
    await first.recordEnd(j.name, startedAt, "success", faker.datatype.number({ min: 1, max: 3600 }));

    const restarted = testMeter();
    new JobTelemetry(redis, [j], logger, restarted.meter);
    points = await collect(restarted.reader);

    expect(points("job.last_start.timestamp", { job_name: j.name })[0].value).to.eq(startedAt / 1000);
    expect(points("job.next_due_after_start.timestamp", { job_name: j.name })[0].value).to.eq(
      nextDueAfter(j.schedule, startedAt) / 1000
    );
    expect(points("job.running_since.timestamp", { job_name: j.name })[0].value).to.eq(0);
    expect(points("job.last_success.timestamp", { job_name: j.name })[0].value * 1000).to.be.within(
      beforeEnd,
      Date.now()
    );
  });

  it("keeps the last success when a later run fails", async () => {
    const j = randomJob();
    const { meter, reader } = testMeter();
    const telemetry = new JobTelemetry(redis, [j], logger, meter);
    const firstStart = Date.now();
    const secondStart = firstStart + faker.datatype.number({ min: 1, max: 3_600_000 });

    await telemetry.recordStart(j.name, firstStart);
    await telemetry.recordEnd(j.name, firstStart, "success", faker.datatype.number({ min: 1, max: 3600 }));
    const [success] = (await collect(reader))("job.last_success.timestamp", { job_name: j.name });

    const outcome = faker.helpers.arrayElement(RUN_OUTCOMES.filter(o => o !== "success"));
    await telemetry.recordStart(j.name, secondStart);
    await telemetry.recordEnd(j.name, secondStart, outcome, faker.datatype.number({ min: 1, max: 3600 }));

    const points = await collect(reader);
    expect(points("job.last_success.timestamp", { job_name: j.name })[0].value).to.eq(success.value);
    expect(points("job.runs", { job_name: j.name, outcome })[0].value).to.eq(1);
  });

  it("keeps the running time of a run that replaced one that outlived its lock", async () => {
    const j = randomJob();
    const { meter, reader } = testMeter();
    const telemetry = new JobTelemetry(redis, [j], logger, meter);
    const overrunStart = faker.date.recent(1).getTime();
    const replacementStart = overrunStart + ms(j.maxComputeTime) + faker.datatype.number({ min: 1, max: 60_000 });

    await telemetry.recordStart(j.name, overrunStart);
    await telemetry.recordStart(j.name, replacementStart);
    await telemetry.recordEnd(j.name, overrunStart, "success", faker.datatype.number({ min: 1, max: 3600 }));

    let points = await collect(reader);
    expect(points("job.running_since.timestamp", { job_name: j.name })[0].value).to.eq(replacementStart / 1000);

    await telemetry.recordEnd(j.name, replacementStart, "success", faker.datatype.number({ min: 1, max: 3600 }));
    points = await collect(reader);
    expect(points("job.running_since.timestamp", { job_name: j.name })[0].value).to.eq(0);
  });

  it("logs and skips the gauges when run times can't be read", async () => {
    const j = randomJob(true);
    const { meter, reader } = testMeter();
    new JobTelemetry(redis, [j], logger, meter);
    const failure = new Error(faker.lorem.sentence());
    const pipeline = redis.pipeline();
    sinon.stub(pipeline, "exec").rejects(failure);
    sinon.stub(redis, "pipeline").returns(pipeline);
    const errorLog = sinon.spy(logger, "error");

    try {
      const points = await collect(reader);

      expect(errorLog.calledWith(failure)).to.be.true;
      expect(points("job.next_due_after_start.timestamp", { job_name: j.name })).to.have.length(0);
      expect(points("job.runs", { job_name: j.name, outcome: "success" })[0].value).to.eq(0);
    } finally {
      sinon.restore();
    }
  });

  it("reports dead-letter items for query jobs only", async () => {
    const simple = randomJob();
    const query = randomJob(true);
    const dead = faker.datatype.number({ min: 1, max: 20 });
    for (let i = 0; i < dead; i++) {
      await redis.hset(`${query.name}:dead-letter`, faker.datatype.uuid(), JSON.stringify(i));
    }

    const { meter, reader } = testMeter();
    new JobTelemetry(redis, [simple, query], logger, meter);

    const points = await collect(reader);
    expect(points("job.dead_letter.items", { job_name: query.name })[0].value).to.eq(dead);
    expect(points("job.dead_letter.items", { job_name: simple.name })).to.have.length(0);
  });
});
