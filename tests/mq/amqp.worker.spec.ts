import "reflect-metadata";

import { faker } from "@faker-js/faker";
import { expect } from "chai";
import { Container } from "inversify";
import sinon from "sinon";

import { Logger } from "../../src/logging/logger";
import { defaultSerializers } from "../../src/logging/serializers";
import { Queue, QueueFactory, Workers } from "../../src/mq";
import { reconnectDelay } from "../../src/mq/amqp/factory";
import { sleep } from "../helpers";
import { customSpy, doSpy, dropConnection, groupAfter, groupBefore, handlerAfter, handlerBefore } from "./helpers/amqp";

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

  it("should resume consuming when RabbitMQ drops the connection", async () => {
    dropConnection(workers);
    await sleep(300);
    expect(workers.isRunning()).to.be.false;

    await sleep(reconnectDelay + 1000);
    expect(workers.isRunning()).to.be.true;

    const amount = faker.finance.amount(100);
    doQueue.push(amount);
    await sleep(300);

    expect(doSpy.calledOnceWithExactly(amount)).to.be.true;
  }, 15_000);

  it("should resume consuming when RabbitMQ closes the channel but keeps the connection", async () => {
    const errors = sinon.spy(logger, "error");
    // acking an unknown delivery tag makes the broker close the channel with PRECONDITION_FAILED
    (workers as any).channel.ack({ fields: { deliveryTag: 999_999 } });
    await sleep(300);
    expect(workers.isRunning()).to.be.false;
    // handled as a channel close, not as an unhandled "error" event that kills the connection
    expect(errors.args.some(([err]) => (err as any)?.code === "ERR_UNHANDLED_ERROR")).to.be.false;
    errors.restore();

    await sleep(reconnectDelay + 1000);
    expect(workers.isRunning()).to.be.true;

    const amount = faker.finance.amount(100);
    doQueue.push(amount);
    await sleep(300);

    expect(doSpy.calledOnceWithExactly(amount)).to.be.true;
  }, 15_000);
});

describe("Worker#stop", () => {
  it("should not reconnect after stop() is called while the connection is down", async () => {
    const stopped = new Workers(new Container());
    await stopped.start(amqpURL, logger);

    dropConnection(stopped);
    await sleep(300);
    await stopped.stop();

    await sleep(reconnectDelay + 1000);
    expect(stopped.isRunning()).to.be.false;
  }, 15_000);
});
