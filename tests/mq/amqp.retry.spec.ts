import "reflect-metadata";

import { faker } from "@faker-js/faker";
import { Channel, Connection, connect } from "amqplib";
import { expect } from "chai";
import { Container } from "inversify";
import sinon from "sinon";

import { Logger } from "../../src/logging/logger";
import { defaultSerializers } from "../../src/logging/serializers";
import { Queue, QueueFactory, Workers } from "../../src/mq";
import { popFromQueue, sleep } from "../helpers";
import { Work, workSpy } from "./helpers/amqp.retry";

const amqpURL = "amqp://localhost:5672";
const logger = new Logger({
  name: "amqp.retry.tests",
  serializers: defaultSerializers(),
  verbose: false
});

let factory: QueueFactory;
let workers: Workers;
let conn: Connection;
let channel: Channel;
let workQueue: Queue<Work>;

beforeAll(async () => {
  const container = new Container();
  factory = await QueueFactory.connect(amqpURL, logger);
  conn = await connect(amqpURL);
  channel = await conn.createChannel();

  workers = new Workers(container);
  // a single prefetch slot, so a held retry would stall the queue
  await workers.start(amqpURL, logger, 1, { max_attempts: 3, backoff: ["100ms"] });

  workQueue = await factory.queue("WORK_JOB");
});

afterAll(async () => {
  await workers.stop();
  for (const queue of ["WORK_JOB", "WORK_JOB_RETRY_100", "WORK_JOB_DEAD"]) {
    await channel.deleteQueue(queue);
  }
  await channel.close();
  await conn.close();
  await factory.close();
});

afterEach(async () => {
  sinon.resetHistory();
  await channel.purgeQueue("WORK_JOB_DEAD");
});

function callsFor(id: string) {
  return workSpy.getCalls().filter(c => (c.args[0] as Work).id === id);
}

describe("Worker retries", () => {
  it("should not hold a prefetch slot while a job retries", async () => {
    const id = faker.datatype.uuid();

    workQueue.push({ id: faker.datatype.uuid(), retry: true });
    workQueue.push({ id, retry: false });
    await sleep(300);

    const calls = callsFor(id);
    expect(calls).to.have.length(1);
    expect(calls[0].args[1]).to.deep.eq({ attempt: 1, max_attempts: 3 });

    // let the retrying job run out its attempts
    await sleep(1000);
  });

  it("should dead-letter a job after max_attempts", async () => {
    const id = faker.datatype.uuid();

    workQueue.push({ id, retry: true });
    await sleep(1000);

    expect(callsFor(id).map(c => c.args[1])).to.deep.eq([
      { attempt: 1, max_attempts: 3 },
      { attempt: 2, max_attempts: 3 },
      { attempt: 3, max_attempts: 3 }
    ]);
    expect(await popFromQueue(channel, "WORK_JOB_DEAD")).to.deep.eq({ id, retry: true });
    expect(await popFromQueue(channel, "WORK_JOB_DEAD")).to.be.null;
  });
});
