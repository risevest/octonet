import "reflect-metadata";

import { faker } from "@faker-js/faker";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import ms from "ms";
import { DiscardPolicy, JetStreamManager, NatsConnection, RetentionPolicy, StorageType, connect } from "nats";

import { StreamFactory } from "../../src/mq";
import { getFromStream } from "../helpers";

chai.use(chaiAsPromised);

let conn: NatsConnection;
let factory: StreamFactory;
let manager: JetStreamManager;

beforeAll(async () => {
  conn = await connect();
  factory = await StreamFactory.init(conn);
  manager = await conn.jetstreamManager();
});

afterEach(async () => {
  await manager.streams.delete("transactions");
});

afterAll(async () => {
  await conn.close();
});

describe("Stream#createStream", () => {
  it("should create broadcast stream if it doesn't exist", async () => {
    const stream = await factory.stream<number>("transactions", { stream_type: "broadcast", buffer_size: 10 });
    const amount = Number(faker.finance.amount());

    await stream.add("credit.vendor.wallet", amount);

    const { config } = await manager.streams.info("transactions");
    expect(config.name).to.eq("transactions");
    expect(config.subjects).to.eql(["transactions.>"]);
    expect(config.storage).to.eq(StorageType.Memory);
    expect(config.retention).to.eq(RetentionPolicy.Limits);
    expect(config.discard).to.eq(DiscardPolicy.Old);
    expect(config.max_age).to.eq(0);
    expect(config.max_msgs).to.eq(10);

    const data = await getFromStream(manager, "transactions.credit.vendor.wallet");
    expect(data).to.be.eq(amount);
  });

  it("should create log stream if it doesn't exist", async () => {
    const stream = await factory.stream<number>("transactions", { stream_type: "log", retention_period: "1d" });
    const amount = Number(faker.finance.amount());

    await stream.add("credit.vendor.wallet", amount);

    const { config } = await manager.streams.info("transactions");
    expect(config.name).to.eq("transactions");
    expect(config.subjects).to.eql(["transactions.>"]);
    expect(config.storage).to.eq(StorageType.File);
    expect(config.retention).to.eq(RetentionPolicy.Limits);
    expect(config.discard).to.eq(DiscardPolicy.Old);
    expect(config.max_age).to.eq(ms("1d") * 1e6);
    expect(config.max_msgs).to.eq(-1);

    const data = await getFromStream(manager, "transactions.credit.vendor.wallet");
    expect(data).to.be.eq(amount);
  });

  it("should update an existing stream", async () => {
    await factory.stream<number>("transactions", { stream_type: "log", retention_period: "1d" });
    await factory.stream<number>("transactions", { stream_type: "log", retention_period: "3d" });

    const { config } = await manager.streams.info("transactions");
    expect(config.name).to.eq("transactions");
    expect(config.subjects).to.eql(["transactions.>"]);
    expect(config.storage).to.eq(StorageType.File);
    expect(config.retention).to.eq(RetentionPolicy.Limits);
    expect(config.discard).to.eq(DiscardPolicy.Old);
    expect(config.max_age).to.eq(ms("3d") * 1e6);
    expect(config.max_msgs).to.eq(-1);
  });

  it("should throw an error if stream types mismatch", async () => {
    await factory.stream<number>("transactions", { stream_type: "log", retention_period: "1d" });
    const stream = factory.stream<number>("transactions", { stream_type: "broadcast", buffer_size: 5 });

    expect(stream).to.be.rejectedWith(
      Error,
      "The transactions stream is already defined with a different stream type(log)"
    );
  });
});
