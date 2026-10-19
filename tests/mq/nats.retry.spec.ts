import "reflect-metadata";

import { faker } from "@faker-js/faker";
import { expect } from "chai";
import { Container } from "inversify";
import { AckPolicy, DeliverPolicy, JetStreamManager, NatsConnection, StorageType, connect, nanos } from "nats";
import sinon from "sinon";

import { Consumers, Logger, NatsPublisher, defaultSerializers } from "../../src";
import { durableName } from "../../src/mq/nats/consumers";
import { repeat, sleep } from "../helpers";
import { Work, work } from "./helpers/nats.retry";

const logger = new Logger({
  name: "nats.retry.tests",
  serializers: defaultSerializers(),
  verbose: false
});

const durable = durableName("retries", "octonet", "retries.work");
const batchSize = 5;

let publisher: NatsPublisher;
let natsConn: NatsConnection;
let jm: JetStreamManager;

beforeAll(async () => {
  const container = new Container();
  natsConn = await connect();
  jm = await natsConn.jetstreamManager();

  await jm.streams.add({ name: "retries", storage: StorageType.Memory, subjects: ["retries.>"] });
  // simulate a durable created by an older octonet: unlimited deliveries
  await jm.consumers.add("retries", {
    durable_name: durable,
    ack_policy: AckPolicy.Explicit,
    ack_wait: nanos(30_000),
    deliver_policy: DeliverPolicy.New,
    filter_subject: "retries.work"
  });

  const consumer = new Consumers(container);
  await consumer.start(natsConn, logger, {
    namespace: "octonet",
    batch_size: batchSize,
    timeout: "1m",
    max_deliver: 3,
    backoff: ["100ms"]
  });
  publisher = new NatsPublisher(natsConn.jetstream());
});

afterAll(async () => {
  await jm.streams.delete("retries");
  await natsConn.close();
});

afterEach(() => {
  sinon.resetHistory();
});

function callsFor(id: string) {
  return work.getCalls().filter(c => (c.args[0] as Work).id === id);
}

describe("Consumer retries", () => {
  it("should update an existing durable to the configured limits", async () => {
    const info = await jm.consumers.info("retries", durable);

    expect(info.config.max_deliver).to.eq(3);
    expect(info.config.ack_wait).to.eq(nanos(60_000));
  });

  it("should stop redelivering a RetryError message after max_deliver", async () => {
    const id = faker.datatype.uuid();
    await publisher.publish("retries.work", { id, retry: true });

    await sleep(1000);

    const attempts = callsFor(id).map(c => c.args[1]);
    expect(attempts).to.deep.eq([
      { attempt: 1, max_attempts: 3 },
      { attempt: 2, max_attempts: 3 },
      { attempt: 3, max_attempts: 3 }
    ]);
  });

  it("should keep pulling new messages while some messages retry", async () => {
    const retryId = faker.datatype.uuid();
    await publisher.publish("retries.work", { id: retryId, retry: true });

    const ids = Array.from({ length: batchSize * 3 }).map(() => faker.datatype.uuid());
    await repeat(ids.length, i => publisher.publish("retries.work", { id: ids[i], retry: false }));

    await sleep(1000);

    ids.forEach(id => {
      const calls = callsFor(id);
      expect(calls).to.have.length(1);
      expect(calls[0].args[1]).to.deep.eq({ attempt: 1, max_attempts: 3 });
    });
    expect(callsFor(retryId)).to.have.length(3);
  });
});
