import "reflect-metadata";

import { faker } from "@faker-js/faker";
import { expect } from "chai";
import { Container } from "inversify";
import { JetStreamManager, NatsConnection, StorageType, connect } from "nats";
import sinon from "sinon";

import { Consumers, Logger, NatsPublisher, defaultSerializers } from "../../src";
import { repeat, sleep } from "../helpers";
import {
  allCredits,
  creditWallet,
  debitWallet,
  groupAfter,
  groupBefore,
  handlerAfter,
  handlerBefore
} from "./helpers/nats";

export const logger = new Logger({
  name: "nats.publisher.consumer.tests",
  serializers: defaultSerializers(),
  verbose: false
});

let publisher: NatsPublisher;
let natsConn: NatsConnection;
let jm: JetStreamManager;

beforeAll(async () => {
  const container = new Container();
  natsConn = await connect();
  jm = await natsConn.jetstreamManager();

  // create the stream to listen to
  await jm.streams.add({ name: "transactions", storage: StorageType.Memory, subjects: ["transactions.>"] });

  const consumer = new Consumers(container);
  await consumer.start(natsConn, logger, { namespace: "octonet", batch_size: 10, timeout: "1m" });
  publisher = new NatsPublisher(natsConn.jetstream());
});

afterAll(async () => {
  await jm.streams.delete("transactions");
  await natsConn.close();
});

afterEach(() => {
  sinon.resetBehavior();
  sinon.resetHistory();
});

describe("Consumer", () => {
  it("should run handler based on topic", async () => {
    const debit = faker.finance.amount(1000, 10_000);
    const credit = faker.finance.amount(1000, 10_000);

    await publisher.publish("transactions.credit.wallet.plan", debit);
    await publisher.publish("transactions.credit.plan.wallet", credit);

    await sleep(300);

    expect(creditWallet.calledOnce).to.be.true;
    expect(debitWallet.calledOnce).to.be.true;

    expect(creditWallet.calledWith(credit)).to.be.true;
    expect(debitWallet.calledWith(debit)).to.be.true;

    expect(allCredits.calledTwice).to.be.true;
  });

  it("should run middleware in the right order", async () => {
    const amount = faker.finance.amount(100);

    await publisher.publish("transactions.credit.wallet.plan", amount);
    await sleep(300);

    expect(groupBefore.calledBefore(handlerBefore)).to.be.true;
    expect(groupAfter.calledAfter(handlerAfter)).to.be.true;
    expect(handlerBefore.calledBefore(debitWallet)).to.be.true;
    expect(handlerAfter.calledAfter(debitWallet)).to.be.true;
  });

  it("can handle more than 10 messages", async () => {
    const numOfMsgs = faker.datatype.number({ min: 11, max: 30 });
    await repeat(numOfMsgs, async () => {
      return publisher.publish("transactions.credit.wallet.plan", faker.finance.amount(100));
    });

    await sleep(300);

    expect(debitWallet.callCount).to.eq(numOfMsgs);
    expect(allCredits.callCount).to.eq(numOfMsgs);
  });
});
