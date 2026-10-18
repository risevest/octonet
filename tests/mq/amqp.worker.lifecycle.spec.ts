import "reflect-metadata";

import { connect } from "amqplib";
import { expect } from "chai";
import { Container } from "inversify";

import { Logger } from "../../src/logging/logger";
import { defaultSerializers } from "../../src/logging/serializers";
import { QueueFactory, Workers, command, worker } from "../../src/mq";
import { sleep } from "../helpers";

const amqpURL = "amqp://localhost:5672";
const logger = new Logger({
  name: "amqp.worker.lifecycle.tests",
  serializers: defaultSerializers(),
  verbose: false
});

const LIFECYCLE_QUEUE = "LIFECYCLE_JOB";
let release: () => void = () => {};
let handled: string[] = [];

@worker("lifecycle")
export class LifecycleWorker {
  @command(LIFECYCLE_QUEUE)
  async run(data: string) {
    if (data === "slow") {
      await new Promise<void>(resolve => (release = resolve));
    }
    handled.push(data);
  }
}

async function deleteQueue(queue: string) {
  const conn = await connect(amqpURL);
  const channel = await conn.createChannel();
  await channel.deleteQueue(queue);
  await conn.close();
}

// Handler metadata is read once per process, so every test reuses one
// instance; restarting it is the lifecycle under test.
let workers: Workers;

beforeAll(() => {
  workers = new Workers(new Container());
});

beforeEach(async () => {
  handled = [];
  await deleteQueue(LIFECYCLE_QUEUE);
});

afterEach(async () => {
  await workers.stop();
});

describe("Worker lifecycle", () => {
  it("rejects start() when a queue cannot be asserted", async () => {
    const conn = await connect(amqpURL);
    const channel = await conn.createChannel();
    // same name, different arguments: the worker's durable assert must fail
    await channel.assertQueue(LIFECYCLE_QUEUE, { durable: false });

    let error: Error | undefined;
    try {
      await workers.start(amqpURL, logger);
    } catch (err) {
      error = err as Error;
    }

    expect(error).to.be.instanceOf(Error);
    expect(workers.isRunning()).to.be.false;
    await conn.close();
  });

  it("reports running only after every consumer is registered", async () => {
    const starting = workers.start(amqpURL, logger);
    expect(workers.isRunning()).to.be.false;
    await starting;

    expect(workers.isRunning()).to.be.true;
    const queues = workers.registrations().map(r => r.queue);
    expect(queues).to.include(LIFECYCLE_QUEUE);
    workers.registrations().forEach(r => expect(r.consumer_tag).to.be.a("string").and.not.empty);
  });

  it("acks an in-flight message on its own channel after a restart", async () => {
    const conn = await connect(amqpURL);
    const factory = await QueueFactory.connect(amqpURL, logger);
    await workers.start(conn, logger);

    const queue = await factory.queue<string>(LIFECYCLE_QUEUE);
    queue.push("slow");
    await sleep(300);

    // restart on the same connection while "slow" is still running
    await workers.start(conn, logger);
    release();
    await sleep(300);

    // acking "slow" on the new channel would close it and flip health
    expect(handled).to.include("slow");
    expect(workers.isRunning()).to.be.true;

    queue.push("after");
    await sleep(300);
    expect(handled).to.include("after");

    await factory.close();
    await conn.close();
  });

  it("reports not running when its channel closes", async () => {
    await workers.start(amqpURL, logger);
    expect(workers.isRunning()).to.be.true;

    await (workers as any).channel.close();
    await sleep(100);

    expect(workers.isRunning()).to.be.false;
  });

  it("ignores close events from an older generation", async () => {
    const conn = await connect(amqpURL);
    await workers.start(conn, logger);
    const oldChannel = (workers as any).channel;

    await workers.start(conn, logger);
    await oldChannel.close();
    await sleep(100);

    expect(workers.isRunning()).to.be.true;
    await conn.close();
  });
});
