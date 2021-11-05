import { expect } from "chai";
import amqp from "amqplib";
import { Consumer } from "../../src/workers/consumer";
import { Container } from "inversify";
import { Logger, LoggerConfig } from "../../src/logging";
import TAGS from "../../src/tags";
import { createQueue, Queue } from "./helpers/amqp.helper";
import { promisify } from "util";
import { mockFund, testWallet } from "./helpers/wallet.mock";
import { IWallet, TYPES } from "./helpers/wallet.helper";

let testContainer: Container;
let logger: Logger;
let queue: Queue;
let testLoggerConfig: LoggerConfig;

const sleep = promisify(setTimeout);

before(async () => {
  let loggerSerializer = {
    req: () => {}
  };
  testLoggerConfig = {
    name: "test logger",
    serializers: loggerSerializer
  };
  logger = new Logger(testLoggerConfig);

  testContainer = new Container();
  testContainer.bind<Logger>(TAGS.Logger).toConstantValue(logger);
  testContainer.bind<IWallet>(TYPES.Wallet).toConstantValue(testWallet);

  // queue connection
  const conn = await amqp.connect("amqp://localhost:5672");
  queue = await createQueue("amqp://localhost:5672");

  // consumer creation
  const testConsumer: Consumer = new Consumer(testContainer, logger);
  testConsumer.listen(conn);
});

describe("Consumer", () => {
  it('should create a consumer that emits a "fund" event', async () => {
    await queue.push("WALLET_FUND", 500);
    await sleep(300);

    expect(mockFund.called).to.be.true;
  });
});
