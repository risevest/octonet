import "reflect-metadata";

import { faker } from "@faker-js/faker";
import { expect } from "chai";
import { Container } from "inversify";
import sinon from "sinon";

import { Logger } from "../../src/logging/logger";
import { defaultSerializers } from "../../src/logging/serializers";
import { Queue, QueueFactory, Workers } from "../../src/mq";
import { sleep } from "../helpers";
import { customSpy, doSpy, groupAfter, groupBefore, handlerAfter, handlerBefore } from "./helpers/amqp";

const amqpURL = "amqp://localhost:5672";
const logger = new Logger({
  name: "amqp.worker.tests",
  serializers: defaultSerializers(),
  verbose: false
});

let factory: QueueFactory;
let workers: Workers;
let doQueue: Queue<string>;
let customQueue: Queue<string>;

beforeAll(async () => {
  const container = new Container();
  factory = await QueueFactory.connect(amqpURL, logger);

  workers = new Workers(container);
  await workers.start(amqpURL, logger);

  doQueue = await factory.queue("DO_JOB");
  customQueue = await factory.queue("CUSTOM_JOB");
});

afterAll(async () => {
  await factory.close();
  await workers.stop();
});

afterEach(() => {
  sinon.resetBehavior();
  sinon.resetHistory();
});

describe("Worker", () => {
  it("should run path based job name", async () => {
    const amount = faker.finance.amount(100);

    doQueue.push(amount);
    await sleep(300);

    expect(doSpy.called).to.be.true;
    expect(doSpy.firstCall.firstArg).to.eq(amount);
  });

  it("should run job regardless of naming structure", async () => {
    const amount = faker.finance.amount(100);

    customQueue.push(amount);
    await sleep(300);

    expect(customSpy.called).to.be.true;
    expect(customSpy.firstCall.firstArg).to.eq(amount);
  });

  it("should run middleware in the right order", async () => {
    const amount = faker.finance.amount(100);

    doQueue.push(amount);
    await sleep(300);

    expect(groupBefore.calledBefore(handlerBefore)).to.be.true;
    expect(groupAfter.calledAfter(handlerAfter)).to.be.true;
    expect(handlerBefore.calledBefore(doSpy)).to.be.true;
    expect(handlerAfter.calledAfter(doSpy)).to.be.true;
  });
});
