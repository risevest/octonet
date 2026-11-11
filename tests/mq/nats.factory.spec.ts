import "reflect-metadata";

import { expect } from "chai";

import { StreamFactory } from "../../src/mq";

describe("StreamFactory#init", () => {
  it("should keep reconnecting to NATS forever by default", async () => {
    const factory = await StreamFactory.init("nats://localhost:4222");
    const options = (factory as any).conn.options;

    expect(options.maxReconnectAttempts).to.eq(-1);
    await factory.stop();
  });

  it("should let callers override the reconnect settings", async () => {
    const factory = await StreamFactory.init("nats://localhost:4222", { maxReconnectAttempts: 3 });
    const options = (factory as any).conn.options;

    expect(options.maxReconnectAttempts).to.eq(3);
    await factory.stop();
  });
});
