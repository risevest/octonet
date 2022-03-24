import "reflect-metadata";

import { expect } from "chai";
import faker from "faker";
import { Container } from "inversify";
import sinon from "sinon";

import {
  AMQPQueue,
  ChannelProvider,
  ChannelProviderTag,
  ConnectionManager,
  Logger,
  defaultSerializers
} from "../../src";
import { AMQPWorker } from "../../src/";
import { sleep } from "../helpers";
import { customSpy, doSpy, groupAfter, groupBefore, handlerAfter, handlerBefore } from "./helpers/amqp";

const queueTag = Symbol.for("AMQPQueue");
const amqpURL = "amqp://localhost:5672";
export const logger = new Logger({
  name: "amqp.worker.tests",
  serializers: defaultSerializers(),
  verbose: false
});

let queue: AMQPQueue;
let manager: ConnectionManager;

beforeAll(async () => {
  const container = new Container();
  manager = await ConnectionManager.connect(amqpURL, logger);

  container.bind<ChannelProvider>(ChannelProviderTag).toProvider(manager.provider());
  container.bind<AMQPQueue>(queueTag).to(AMQPQueue);

  const worker = new AMQPWorker(container, logger);
  worker.listen(await manager.createChannel());

  queue = container.get<AMQPQueue>(queueTag);
});

afterAll(async () => {
  await manager.close();
});

afterEach(() => {
  sinon.resetBehavior();
  sinon.resetHistory();
});

describe("Worker", () => {
  it("should run path based job name", async () => {
    const amount = faker.finance.amount(100);

    await queue.push("DO_JOB", amount);
    await sleep(300);

    expect(doSpy.called).to.be.true;
    expect(doSpy.firstCall.firstArg).to.eq(amount);
  });

  it("should run job regardless of naming structure", async () => {
    const amount = faker.finance.amount(100);

    await queue.push("CUSTOM_JOB", amount);
    await sleep(300);

    expect(customSpy.called).to.be.true;
    expect(customSpy.firstCall.firstArg).to.eq(amount);
  });

  it("should run middleware in the right order", async () => {
    const amount = faker.finance.amount(100);

    await queue.push("DO_JOB", amount);
    await sleep(300);

    expect(groupBefore.calledBefore(handlerBefore)).to.be.true;
    expect(groupAfter.calledAfter(handlerAfter)).to.be.true;
    expect(handlerBefore.calledBefore(doSpy)).to.be.true;
    expect(handlerAfter.calledAfter(doSpy)).to.be.true;
  });
});
