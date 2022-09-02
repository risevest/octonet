import "reflect-metadata";

import { expect } from "chai";
import faker from "faker";
import { Container } from "inversify";
import sinon from "sinon";

import { Logger } from "../../src/logging/logger";
import { defaultSerializers } from "../../src/logging/serializers";
import { Queue, QueueFactory, WorkerRunner } from "../../src/mq";
import { sleep } from "../helpers";
import { customSpy, doSpy, groupAfter, groupBefore, handlerAfter, handlerBefore } from "./helpers/amqp";

const amqpURL = "amqp://localhost:5672";
export const logger = new Logger({
  name: "amqp.worker.tests",
  serializers: defaultSerializers(),
  verbose: false
});

let factory: QueueFactory;
let runner: WorkerRunner;
let doQueue: Queue<string>;
let customQueue: Queue<string>;

beforeAll(async () => {
  const container = new Container();
  factory = await QueueFactory.connect(amqpURL, logger);

  runner = new WorkerRunner(container, logger);
  await runner.start(amqpURL);

  doQueue = await factory.queue("DO_JOB");
  customQueue = await factory.queue("CUSTOM_JOB");
});

afterAll(async () => {
  await factory.close();
  await runner.stop();
});

afterEach(() => {
  sinon.resetBehavior();
  sinon.resetHistory();
});

describe("Worker", () => {
  it("should run path based job name", async () => {
    const amount = faker.finance.amount(100);

    await doQueue.push(amount);
    await sleep(300);

    expect(doSpy.called).to.be.true;
    expect(doSpy.firstCall.firstArg).to.eq(amount);
  });

  it("should run job regardless of naming structure", async () => {
    const amount = faker.finance.amount(100);

    await customQueue.push(amount);
    await sleep(300);

    expect(customSpy.called).to.be.true;
    expect(customSpy.firstCall.firstArg).to.eq(amount);
  });

  it("should run middleware in the right order", async () => {
    const amount = faker.finance.amount(100);

    await doQueue.push(amount);
    await sleep(300);

    expect(groupBefore.calledBefore(handlerBefore)).to.be.true;
    expect(groupAfter.calledAfter(handlerAfter)).to.be.true;
    expect(handlerBefore.calledBefore(doSpy)).to.be.true;
    expect(handlerAfter.calledAfter(doSpy)).to.be.true;
  });
});
