import amqp from "amqplib";
import { expect } from "chai";
import faker from "faker";
import { Container } from "inversify";
import "reflect-metadata";
import { defaultSerializers, Logger } from "../../src";
import { Consumer } from "../../src/";
import { sleep } from "../helpers";
import { createQueue, Queue } from "./helpers/amqp.helper";
import { mockFund, mockWithdrawal, Wallet, WalletStub, WalletStubTag } from "./helpers/wallet.helper";

const amqpURL = "amqp://localhost:5672";
export const logger = new Logger({
  name: "consumer_tests",
  serializers: defaultSerializers(),
  verbose: false
});

let queue: Queue;

before(async () => {
  const testContainer = new Container();
  testContainer.bind<WalletStub>(WalletStubTag).toConstantValue(Wallet);

  const testConsumer: Consumer = new Consumer(testContainer, logger);
  testConsumer.listen(await amqp.connect(amqpURL));

  queue = await createQueue("amqp://localhost:5672");
});

describe("Consumer", () => {
  it("should consume the fund event", async () => {
    const amount = parseFloat(faker.finance.amount(100));
    const fund = mockFund(amount);

    await queue.push("WALLET_FUND", amount);
    await sleep(300);

    expect(fund.called).to.be.true;
  });

  it("should consume the withdaraw event", async () => {
    const withdrawal = { amount: parseFloat(faker.finance.amount(100)), receiver: faker.datatype.uuid() };
    const withdraw = mockWithdrawal(withdrawal);

    await queue.push("WALLET_WITHDRAW", withdrawal);
    await sleep(300);

    expect(withdraw.called).to.be.true;
  });
});
