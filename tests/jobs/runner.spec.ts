import { faker } from "@faker-js/faker";
import { metrics } from "@opentelemetry/api";
import { expect } from "chai";
import { Container } from "inversify";
import IORedis, { Redis } from "ioredis";
import cron from "node-cron";
import sinon from "sinon";

import { Logger, defaultSerializers } from "../../src";
import { Job } from "../../src/jobs/decorators";
import { JobRunner, acquireLock, releaseLock, runJob } from "../../src/jobs/runner";
import { JobTelemetry, RUN_OUTCOMES, RunOutcome } from "../../src/jobs/telemetry";
import { jumpBy, multiply, sleep, withTimePaused } from "../helpers";
import { GROUP_NAME, dataSpy, normalSpy, querySpy } from "./helpers/decorators";
import { collect, testMeter } from "./helpers/metrics";

const redisURL = "redis://localhost:6379";
const logger = new Logger({
  name: "amqp.worker.tests",
  serializers: defaultSerializers(),
  verbose: false
});

let redis: Redis;
let runner: JobRunner;

beforeAll(async () => {
  redis = new IORedis(redisURL);
  runner = new JobRunner(new Container());
});

afterEach(() => {
  sinon.resetBehavior();
  sinon.resetHistory();
  runner.stop();

  return redis.flushdb();
});

afterAll(async () => {
  return redis.quit();
});

describe("acquireLock", () => {
  it("should only give one client the lock", async () => {
    const owners = multiply(20, () => faker.datatype.uuid());
    let locks = await Promise.all(owners.slice(0, 11).map(x => acquireLock(redis, "locks", x, "5s")));

    await sleep(3000);

    locks = locks.concat(await Promise.all(owners.slice(11).map(x => acquireLock(redis, "locks", x, "5s"))));

    const accepted = locks.filter(x => x);
    const rejected = locks.filter(x => !x);

    expect(accepted).to.have.length(1);
    expect(rejected).to.have.length(19);
  });

  it("should only give one client the lock", async () => {
    const firstOwner = faker.datatype.uuid();
    const latestOwner = faker.datatype.uuid();

    const acceptedFirst = await acquireLock(redis, "locks", firstOwner, "500ms");
    await sleep(1000);
    const acceptedLatest = await acquireLock(redis, "locks", latestOwner, "4s");

    expect(acceptedFirst).to.be.true;
    expect(acceptedLatest).to.be.true;
  });
});

describe("releaseLock", () => {
  it("should release owned lock", async () => {
    const owner = faker.datatype.uuid();
    const owned = await acquireLock(redis, "locks", owner, "10s");
    const released = await releaseLock(redis, "locks", owner);

    expect(owned).to.be.true;
    expect(released).to.be.true;
  });

  it("should ignore expired lock", async () => {
    const owner = faker.datatype.uuid();
    const owned = await acquireLock(redis, "locks", owner, "1s");
    await sleep(1500);
    const released = await releaseLock(redis, "locks", owner);

    expect(owned).to.be.true;
    expect(released).to.be.false;
  });

  it("should ignore locks not owned by client", async () => {
    const owner = faker.datatype.uuid();
    const owned = await acquireLock(redis, "locks", owner, "10s");
    const released = await releaseLock(redis, "locks", faker.datatype.uuid());

    expect(owned).to.be.true;
    expect(released).to.be.false;
  });
});

describe("JobRunner#run", () => {
  it("should run the normal job immediately", async () => {
    await runner.start(redis, logger);

    runner.run(`${GROUP_NAME}.normal`);
    await sleep(500);

    expect(normalSpy.called).to.be.true;
    expect(normalSpy.firstCall.firstArg).to.eq(0);
  });
});

describe("JobRunner.CronGroup#normalJob", () => {
  it("should call job first thing in the morning", async () => {
    const jump = jumpBy("0 0 * * *");
    await runner.start(redis, logger);

    await jump(500);

    expect(normalSpy.called).to.be.true;
    expect(normalSpy.firstCall.firstArg).to.eq(0);
  });
});

describe("JobRunner.CronGroup#dataJob", () => {
  it("should call job right before midnight", async () => {
    const jump = jumpBy("0 23 * * *");
    await runner.start(redis, logger);

    await jump(500);

    expect(querySpy.called).to.be.true;
    expect(dataSpy.callCount).to.eq(4);
    dataSpy.getCalls().forEach((call, i) => {
      expect(call.args[0]).to.eq(i + 1);
    });
  });

  it("should call job to handle existing work", async () => {
    await withTimePaused(async _f => {
      await redis.rpush(`${GROUP_NAME}.data`, JSON.stringify(20));
      await redis.rpush(`${GROUP_NAME}.data`, JSON.stringify(30));

      await runner.start(redis, logger);

      await sleep(500);

      expect(querySpy.called).to.be.false;
      expect(dataSpy.callCount).to.eq(2);
      expect(dataSpy.firstCall.firstArg).to.eq(20);
      expect(dataSpy.secondCall.firstArg).to.eq(30);
    });
  });
});

describe("runJob", () => {
  jest.setTimeout(20_000);

  function randomJob(overrides: Partial<Job<number>> = {}): Job<number> {
    return {
      name: `group.${faker.lorem.word()}_${faker.datatype.uuid()}`,
      schedule: "0 0 * * *",
      retries: 0,
      timeout: "10ms",
      maxComputeTime: "1m",
      job: async () => {},
      ...overrides
    };
  }

  function randomItems() {
    return multiply(faker.datatype.number({ min: 2, max: 15 }), () => faker.datatype.number());
  }

  async function runWithTelemetry(j: Job<number>) {
    const { meter, reader } = testMeter();
    const telemetry = new JobTelemetry(redis, [j], logger, meter);
    const run = runJob(redis, faker.datatype.uuid(), j, logger, telemetry);
    const error = await run.then(
      () => null,
      err => err
    );
    return { error, points: await collect(reader) };
  }

  function expectOnlyOutcome(points: Awaited<ReturnType<typeof collect>>, name: string, outcome: RunOutcome) {
    for (const o of RUN_OUTCOMES) {
      expect(points("job.runs", { job_name: name, outcome: o })[0].value).to.eq(o === outcome ? 1 : 0);
    }
  }

  it("records success for a simple job", async () => {
    const j = randomJob();

    const { error, points } = await runWithTelemetry(j);

    expect(error).to.be.null;
    expectOnlyOutcome(points, j.name, "success");
    expect(points<any>("job.duration", { job_name: j.name })[0].value.count).to.eq(1);
    expect(points("job.last_success.timestamp", { job_name: j.name })).to.have.length(1);
    expect(points("job.running_since.timestamp", { job_name: j.name })[0].value).to.eq(0);
  });

  it("still runs the job when its start time can't be saved", async () => {
    const job = sinon.spy();
    const j = randomJob({ job: async () => job() });
    const failure = new Error(faker.lorem.sentence());
    const recordStart = sinon.stub(JobTelemetry.prototype, "recordStart").rejects(failure);
    const errorLog = sinon.spy(logger, "error");

    try {
      const { error, points } = await runWithTelemetry(j);

      expect(error).to.be.null;
      expect(recordStart.calledOnce).to.be.true;
      expect(job.calledOnce).to.be.true;
      expect(errorLog.calledWith(failure)).to.be.true;
      expectOnlyOutcome(points, j.name, "success");
      expect(points("job.last_success.timestamp", { job_name: j.name })).to.have.length(1);
      expect(points("job.running_since.timestamp", { job_name: j.name })[0].value).to.eq(0);
    } finally {
      sinon.restore();
    }
  });

  it("rethrows the job's error when recording the end fails", async () => {
    const message = faker.lorem.sentence();
    const j = randomJob({ job: async () => Promise.reject(new Error(message)) });
    const failure = new Error(faker.lorem.sentence());
    sinon.stub(redis, "eval").rejects(failure);
    const errorLog = sinon.spy(logger, "error");

    try {
      const { error, points } = await runWithTelemetry(j);

      expect(error.message).to.eq(message);
      expect(errorLog.calledWith(failure)).to.be.true;
      expectOnlyOutcome(points, j.name, "failed");
    } finally {
      sinon.restore();
    }
  });

  it("records failed with a real error when a job rejects with a non-error", async () => {
    const value = faker.helpers.arrayElement([undefined, null, faker.lorem.word()]);
    const j = randomJob({ job: async () => Promise.reject(value) });

    const { error, points } = await runWithTelemetry(j);

    expect(error).to.be.instanceOf(Error);
    expect(error.message).to.eq(String(value));
    expectOnlyOutcome(points, j.name, "failed");
  });

  it("records query_failed when the query rejects with a non-error", async () => {
    const value = faker.helpers.arrayElement([undefined, null, faker.lorem.word()]);
    const j = randomJob({ query: async () => Promise.reject(value) });

    const { error, points } = await runWithTelemetry(j);

    expect(error).to.be.instanceOf(Error);
    expectOnlyOutcome(points, j.name, "query_failed");
  });

  it("records failed, not query_failed, when filling the queue fails", async () => {
    const items = randomItems();
    const failure = new Error(faker.lorem.sentence());
    const job = sinon.spy();
    const j = randomJob({ job: async n => job(n), query: async () => items });
    sinon.stub(redis, "multi").returns({ exec: () => Promise.reject(failure) } as any);

    try {
      const { error, points } = await runWithTelemetry(j);

      expect(error.message).to.eq(failure.message);
      expect(job.called).to.be.false;
      expectOnlyOutcome(points, j.name, "failed");
    } finally {
      sinon.restore();
    }
  });

  it("records items finished before redis fails while working the queue", async () => {
    const items = randomItems();
    const done = faker.datatype.number({ min: 1, max: items.length - 1 });
    const j = randomJob();
    await acquireLock(redis, j.name, faker.datatype.uuid(), j.maxComputeTime);
    await redis.rpush(j.name, ...items.map(i => JSON.stringify(i)));
    const lpop = redis.lpop.bind(redis);
    let pops = 0;
    sinon.stub(redis, "lpop").callsFake(((key: string) => {
      pops++;
      return pops > done ? Promise.reject(new Error(faker.lorem.word())) : lpop(key);
    }) as any);

    try {
      const { error, points } = await runWithTelemetry(j);

      expect(error).to.be.instanceOf(Error);
      expect(points("job.items", { job_name: j.name, outcome: "success" })[0].value).to.eq(done);
    } finally {
      sinon.restore();
    }
  });

  it("records failed and rethrows when a simple job throws", async () => {
    const message = faker.lorem.sentence();
    const j = randomJob({ job: async () => Promise.reject(new Error(message)) });

    const { error, points } = await runWithTelemetry(j);

    expect(error.message).to.eq(message);
    expectOnlyOutcome(points, j.name, "failed");
    expect(points("job.last_success.timestamp", { job_name: j.name })).to.have.length(0);
  });

  it("records query_failed when the query throws before queuing anything", async () => {
    const message = faker.lorem.sentence();
    const job = sinon.spy();
    const j = randomJob({ job: async n => job(n), query: async () => Promise.reject(new Error(message)) });

    const { error, points } = await runWithTelemetry(j);

    expect(error.message).to.eq(message);
    expect(job.called).to.be.false;
    expectOnlyOutcome(points, j.name, "query_failed");
  });

  it("works the queued items and records partial when the query throws partway", async () => {
    const message = faker.lorem.sentence();
    const pages = multiply(faker.datatype.number({ min: 1, max: 4 }), randomItems);
    const job = sinon.spy();
    const query: any = async function* () {
      for (const page of pages) {
        yield page;
      }
      throw new Error(message);
    };
    const j = randomJob({ job: async n => job(n), query });

    const { error, points } = await runWithTelemetry(j);

    const queued = pages.flat();
    expect(error.message).to.eq(message);
    expect(job.args.map(a => a[0])).to.deep.eq(queued);
    expectOnlyOutcome(points, j.name, "partial");
    expect(points("job.items", { job_name: j.name, outcome: "success" })[0].value).to.eq(queued.length);
  });

  it("records partial and leaves failed items in dead-letter", async () => {
    const items = randomItems();
    const failing = new Set(faker.helpers.arrayElements(items, faker.datatype.number({ min: 1, max: items.length })));
    const j = randomJob({
      job: async n => (failing.has(n) ? Promise.reject(new Error(faker.lorem.word())) : undefined),
      query: async () => items
    });

    const { error, points } = await runWithTelemetry(j);

    const failed = items.filter(i => failing.has(i)).length;
    expect(error).to.be.null;
    expectOnlyOutcome(points, j.name, "partial");
    expect(points("job.items", { job_name: j.name, outcome: "failed" })[0].value).to.eq(failed);
    expect(points("job.items", { job_name: j.name, outcome: "success" })[0].value).to.eq(items.length - failed);
    expect(points("job.last_run.items", { job_name: j.name, outcome: "failed" })[0].value).to.eq(failed);
    expect(points("job.last_run.items", { job_name: j.name, outcome: "success" })[0].value).to.eq(
      items.length - failed
    );
    expect(await redis.hlen(`${j.name}:dead-letter`)).to.eq(failed);
  });

  it("records success when every queued item succeeds", async () => {
    const items = randomItems();
    const j = randomJob({ query: async () => items });

    const { error, points } = await runWithTelemetry(j);

    expect(error).to.be.null;
    expectOnlyOutcome(points, j.name, "success");
    expect(points("job.items", { job_name: j.name, outcome: "success" })[0].value).to.eq(items.length);
  });

  it("counts items but no run on a replica without the lock", async () => {
    const items = randomItems();
    const query = sinon.spy(async () => items);
    const job = sinon.spy();
    const j = randomJob({ job: async n => job(n), query });
    await acquireLock(redis, j.name, faker.datatype.uuid(), j.maxComputeTime);
    await redis.rpush(j.name, ...items.map(i => JSON.stringify(i)));

    const { error, points } = await runWithTelemetry(j);

    expect(error).to.be.null;
    expect(query.called).to.be.false;
    expect(job.args.map(a => a[0])).to.deep.eq(items);
    expectOnlyOutcome(points, j.name, null);
    expect(points("job.items", { job_name: j.name, outcome: "success" })[0].value).to.eq(items.length);
    expect(await redis.hget(`${j.name}:telemetry`, "start")).to.be.null;
  });

  it("adds a lock loser's items to the run whose items it worked", async () => {
    const items = randomItems();
    const j = randomJob({ query: async () => items });
    const runStart = faker.date.recent(1).getTime();
    await redis.hset(`${j.name}:telemetry`, "start", runStart, "running", runStart);
    await acquireLock(redis, j.name, faker.datatype.uuid(), j.maxComputeTime);
    await redis.rpush(j.name, ...items.map(i => JSON.stringify(i)));

    const { error, points } = await runWithTelemetry(j);

    expect(error).to.be.null;
    expect(points("job.last_run.items", { job_name: j.name, outcome: "success" })[0].value).to.eq(items.length);
    expect(points("job.last_run.items", { job_name: j.name, outcome: "failed" })[0].value).to.eq(0);
  });

  it("keeps a lock loser's late items out of a run that started after them", async () => {
    const items = randomItems();
    const runStart = faker.date.recent(1).getTime();
    let replaced = false;
    const j = randomJob({
      job: async () => {
        if (!replaced) {
          replaced = true;
          await redis.hset(`${j.name}:telemetry`, "start", runStart + 1, "items_success", 0, "items_failed", 0);
        }
      },
      query: async () => items
    });
    await redis.hset(`${j.name}:telemetry`, "start", runStart, "running", runStart);
    await acquireLock(redis, j.name, faker.datatype.uuid(), j.maxComputeTime);
    await redis.rpush(j.name, ...items.map(i => JSON.stringify(i)));

    const { error, points } = await runWithTelemetry(j);

    expect(error).to.be.null;
    expect(points("job.last_run.items", { job_name: j.name, outcome: "success" })[0].value).to.eq(0);
    expect(points("job.items", { job_name: j.name, outcome: "success" })[0].value).to.eq(items.length);
  });

  it("works existing items without running an async query when the queue isn't empty", async () => {
    const items = randomItems();
    const query = sinon.spy(async () => Promise.reject(new Error(faker.lorem.sentence())));
    const job = sinon.spy();
    const j = randomJob({ job: async n => job(n), query });
    await redis.rpush(j.name, ...items.map(i => JSON.stringify(i)));

    const { error, points } = await runWithTelemetry(j);

    expect(error).to.be.null;
    expect(query.called).to.be.false;
    expect(job.args.map(a => a[0])).to.deep.eq(items);
    expectOnlyOutcome(points, j.name, "success");
  });

  it("works existing items without running the query when the queue isn't empty", async () => {
    const items = randomItems();
    let queried = false;
    const query: any = async function* () {
      queried = true;
      yield randomItems();
    };
    const job = sinon.spy();
    const j = randomJob({ job: async n => job(n), query });
    await redis.rpush(j.name, ...items.map(i => JSON.stringify(i)));

    const { error, points } = await runWithTelemetry(j);

    expect(error).to.be.null;
    expect(queried).to.be.false;
    expect(job.args.map(a => a[0])).to.deep.eq(items);
    expectOnlyOutcome(points, j.name, "success");
  });
});

describe("JobRunner#start", () => {
  const global = testMeter();

  beforeAll(() => {
    metrics.setGlobalMeterProvider(global.provider);
  });

  afterEach(() => sinon.restore());

  it("should log a failed scheduled run instead of dropping it", async () => {
    const callbacks: (() => Promise<void>)[] = [];
    sinon.stub(cron, "schedule").callsFake((_expr: string, fn: any) => {
      callbacks.push(fn);
      return { stop: () => {} } as any;
    });
    await runner.start(redis, logger);

    const failure = new Error(faker.lorem.sentence());
    sinon.stub(redis, "set").rejects(failure);
    const errorLog = sinon.spy(logger, "error");

    await Promise.all(callbacks.map(fn => fn()));

    expect(errorLog.calledWith(failure)).to.be.true;
  });

  it("should close the previous telemetry when started again", async () => {
    sinon.stub(cron, "schedule").returns({ stop: () => {} } as any);
    const close = sinon.spy(JobTelemetry.prototype, "close");

    await runner.start(redis, logger);
    await runner.start(redis, logger);

    expect(close.called).to.be.true;
  });

  it("should close the telemetry when every job is stopped", async () => {
    sinon.stub(cron, "schedule").returns({ stop: () => {} } as any);
    await runner.start(redis, logger);
    const close = sinon.spy(JobTelemetry.prototype, "close");

    runner.stop();

    expect(close.calledOnce).to.be.true;
  });

  it("should count items worked on startup", async () => {
    const items = multiply(faker.datatype.number({ min: 1, max: 10 }), () => faker.datatype.number());
    const name = `${GROUP_NAME}.data`;
    const before = (await collect(global.reader))("job.items", { job_name: name, outcome: "success" })[0]?.value ?? 0;
    await redis.rpush(name, ...items.map(i => JSON.stringify(i)));

    await runner.start(redis, logger);

    const after = (await collect(global.reader))("job.items", { job_name: name, outcome: "success" })[0].value;
    expect(after - before).to.eq(items.length);
  });
});
