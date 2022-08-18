import { expect } from "chai";
import { Container } from "inversify";
import IORedis, { Redis } from "ioredis";
import sinon from "sinon";

import { Logger, defaultSerializers } from "../../src";
import { JobRunner } from "../../src/jobs/runner";
import { jumpBy, sleep } from "../helpers";
import { dataSpy, normalSpy, querySpy } from "./helpers/decorators";

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
});

afterAll(async () => {
  return redis.quit();
});

describe("JobRunner.CronGroup#normalJob", () => {
  it("calls job first thing in the morning", async () => {
    const dailyExpr = "0 0 * * *";
    const jump = jumpBy(dailyExpr);
    await runner.start(redis, logger);

    jump();

    expect(normalSpy.called).to.be.true;
    expect(normalSpy.firstCall.firstArg).to.eq(0);
  });
});

describe("JobRunner.CronGroup#dataJob", () => {
  it("calls job first thing in the morning", async () => {
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
});
