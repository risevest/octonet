import { faker } from "@faker-js/faker";
import { expect } from "chai";
import { Container } from "inversify";
import IORedis, { Redis } from "ioredis";
import sinon from "sinon";

import { Logger, defaultSerializers } from "../../src";
import { JobRunner, acquireLock, releaseLock } from "../../src/jobs/runner";
import { jumpBy, multiply, sleep, withTimePaused } from "../helpers";
import { GROUP_NAME, dataSpy, normalSpy, querySpy } from "./helpers/decorators";

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
    await sleep(500);
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
    await sleep(1000);
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
