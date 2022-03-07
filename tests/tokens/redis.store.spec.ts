import { expect } from "chai";
import faker from "faker";
import IORedis, { Redis } from "ioredis";

import { RedisStore } from "../../src";
import { randomString, sleep } from "../helpers";

let redis: Redis;
let store: RedisStore;

beforeAll(async () => {
  const secret = randomString(32);

  redis = new IORedis();
  store = new RedisStore(secret, redis);
});

afterAll(async () => {
  await redis.quit();
});

afterEach(async () => {
  await redis.flushdb();
});

describe("RedisStore#commission", () => {
  it("should store the value in redis", async () => {
    const token = await store.commision(faker.internet.userName(), faker.internet.email(), "10s");
    const val = await redis.get(token);

    expect(val).to.be.a("string");
  });

  it("should create a token that expires after 100ms", async () => {
    const token = await store.commision(faker.internet.userName(), faker.internet.email(), "100ms");
    const t = await redis.pttl(token);

    expect(t).to.lessThanOrEqual(100);
  });

  it("should create same token for the same key", async () => {
    const username = faker.internet.userName();
    const tokenOne = await store.commision(username, faker.internet.email(), "10s");
    const tokenTwo = await store.commision(username, faker.internet.email(), "10s");

    expect(tokenOne).to.equal(tokenTwo);
  });
});

describe("RedisStore#peek", () => {
  it("should return a value without destroying the token", async () => {
    const data = faker.internet.email();
    const token = await store.commision(faker.internet.userName(), data, "3s");
    const value = await store.peek(token);
    const val = await redis.get(token);

    expect(value).to.equal(data);
    expect(val).to.be.a("string");
    expect(val).to.not.be.empty;
  });

  it("should return null after the token expires", async () => {
    const token = await store.commision(faker.internet.userName(), faker.internet.email(), "100ms");

    await sleep(110);
    const val = await store.peek(token);

    expect(val).to.be.null;
  });
});

describe("RedisStore#extend", () => {
  it("should change the lifetime of a token", async () => {
    const data = faker.internet.email();
    const token = await store.commision(faker.internet.userName(), data, "300ms");
    const oldTTL = await redis.pttl(token);

    const fromExtraction = await store.extend(token, "200ms");
    const newTTL = await redis.pttl(token);

    expect(fromExtraction).to.equal(data);
    expect(newTTL).to.not.eq(oldTTL);
    expect(newTTL).to.lessThanOrEqual(200);
  });

  it("should return null after the token expires", async () => {
    const token = await store.commision(faker.internet.userName(), faker.internet.email(), "100ms");

    await sleep(110);
    const val = await store.extend(token, "10ms");

    expect(val).to.be.null;
  });
});

describe("RedisStore#reset", () => {
  it("should reset data a token represents", async () => {
    const data = faker.internet.email();
    const key = faker.internet.userName();
    const token = await store.commision(key, data, "100ms");
    const newData = faker.internet.email();

    await store.reset(key, newData);
    const newValue = await store.peek(token);

    expect(newValue).to.equal(newData);
    expect(newValue).not.eq(data);
  });

  it("should not change the sleep on the token", async () => {
    const key = faker.internet.userName();
    const token = await store.commision(key, faker.internet.email(), "100ms");

    await sleep(50);
    await store.reset(key, faker.internet.email());
    const newTTL = await redis.pttl(token);

    expect(newTTL).to.lessThanOrEqual(50);
  });
});

describe("RedisStore#decommission", () => {
  it("should return a value and destroy the token", async () => {
    const data = faker.internet.email();
    const token = await store.commision(faker.internet.userName(), data, "3s");
    const value = await store.decommission(token);
    const val = await redis.get(token);

    expect(value).to.equal(data);
    expect(val).to.be.null;
  });

  it("should return null after the token expires", async () => {
    const token = await store.commision(faker.internet.userName(), faker.internet.email(), "100ms");

    await sleep(110);
    const val = await store.decommission(token);

    expect(val).to.be.null;
  });
});

describe("RedisStore#revoke", () => {
  it("should delete token for a key if it exists", async () => {
    const key = faker.internet.userName();
    const token = await store.commision(key, faker.internet.email(), "3s");
    await store.revoke(key);
    const val = await redis.get(token);

    expect(val).to.be.null;
  });
});
