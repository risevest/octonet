import "reflect-metadata";

import { Channel, Connection, connect } from "amqplib";
import { expect } from "chai";
import faker from "faker";

import { Logger } from "../../src/logging/logger";
import { defaultSerializers } from "../../src/logging/serializers";
import { QueueFactory } from "../../src/mq";
import { multiply, popFromQueue, repeat, sleep } from "../helpers";

const logger = new Logger({
  name: "amqp.queue.tests",
  serializers: defaultSerializers(),
  verbose: false
});
const amqpURL = "amqp://localhost:5672";

describe("QueueFactory#connectionStatus", () => {
  it("should track connection status of AMQP", async () => {
    const factory = await QueueFactory.connect(amqpURL, logger);

    expect(factory.isConnected()).to.be.true;

    await factory.close();

    expect(factory.isConnected()).to.be.false;
  });
});

describe("QueueFactory#queue", () => {
  let factory: QueueFactory;
  let conn: Connection;
  let channel: Channel;
  const queueName = "MY_QUEUE";

  beforeAll(async () => {
    conn = await connect(amqpURL);
    factory = await QueueFactory.connect(conn, logger);
    channel = await conn.createChannel();
  });

  beforeEach(async () => {
    await channel.deleteQueue(queueName);
  });

  afterAll(async () => {
    await conn.close();
  });

  it("should create a new queue", async () => {
    const queue = await factory.queue(queueName);
    await repeat(10, async () => {
      queue.push(Number(faker.finance.amount()));
    });

    await sleep(500);

    const assertReply = await channel.checkQueue(queueName);
    expect(assertReply.messageCount).to.eq(10);
  });

  it("should restrict queue length based on fixed number of items", async () => {
    const queue = await factory.queue(queueName, 10);
    const amounts = multiply(30, () => Number(faker.finance.amount()));

    for (const a of amounts) {
      queue.push(a);
    }

    await sleep(500);

    const assertReply = await channel.checkQueue(queueName);
    expect(assertReply.messageCount).to.eq(10);

    const latestAmounts = amounts.slice(20);
    for (let i = 0; i < latestAmounts.length; i++) {
      const item = await popFromQueue(channel, queueName);
      expect(latestAmounts[i]).to.eq(item);
    }
  });

  it("should restrict queue length based on fixed number of items", async () => {
    const queue = await factory.queue(queueName, 10);
    const amounts = multiply(30, () => Number(faker.finance.amount()));

    for (const a of amounts) {
      queue.push(a);
    }

    await sleep(500);

    const assertReply = await channel.checkQueue(queueName);
    expect(assertReply.messageCount).to.eq(10);

    const latestAmounts = amounts.slice(20);
    for (let i = 0; i < latestAmounts.length; i++) {
      const item = await popFromQueue(channel, queueName);
      expect(latestAmounts[i]).to.eq(item);
    }
  });

  it("should restrict queue length based on fixed number of items", async () => {
    const queue = await factory.queue(queueName, "100ms");
    await repeat(10, async () => {
      queue.push(Number(faker.finance.amount()));
    });

    await sleep(500);

    const assertReply = await channel.checkQueue(queueName);
    expect(assertReply.messageCount).to.eq(0);
  });
});
