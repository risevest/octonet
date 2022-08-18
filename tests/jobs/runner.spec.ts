import { expect } from "chai";
import { Container } from "inversify";
import IORedis, { Redis } from "ioredis";
import sinon from "sinon";

import { Logger, defaultSerializers } from "../../src";
import { JobRunner } from "../../src/jobs/runner";
import { jumpBy, sleep, withTimePaused } from "../helpers";
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

describe("JobRunner.CronGroup#normalJob", () => {
  it("should call job first thing in the morning", async () => {
    const dailyExpr = "0 0 * * *";
    const jump = jumpBy(dailyExpr);
    await runner.start(redis, logger);

    jump();

    expect(normalSpy.called).to.be.true;
    expect(normalSpy.firstCall.firstArg).to.eq(0);
  });
});

describe("JobRunner.CronGroup#dataJob", () => {
  it("should call job right before midnight", async () => {
    const dailyExpr = "0 23 * * *";
    const jump = jumpBy(dailyExpr);
    await runner.start(redis, logger);

    jump();

    await sleep(1000);

    expect(querySpy.called).to.be.true;
    expect(dataSpy.callCount).to.eq(4);
    dataSpy.getCalls().forEach((call, i) => {
      expect(call.args[0]).to.eq(i + 1);
    });
  });

  it("should call job to handle existing work", async () => {
    await withTimePaused(async _f => {
      redis.rpush(`${GROUP_NAME}.data`, JSON.stringify(20));
      redis.rpush(`${GROUP_NAME}.data`, JSON.stringify(30));

      await runner.start(redis, logger);

      await sleep(1000);

      expect(querySpy.called).to.be.false;
      expect(dataSpy.callCount).to.eq(2);
      expect(dataSpy.firstCall.firstArg).to.eq(20);
      expect(dataSpy.secondCall.firstArg).to.eq(30);
    });
  });
});
