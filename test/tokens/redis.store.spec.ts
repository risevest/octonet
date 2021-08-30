import { expect } from "chai";
import faker from "faker";
import IORedis, { Redis } from "ioredis";
import { RedisStore } from "../../src";
import { randomString, timeout } from "../helpers";

let redis: Redis;
let store: RedisStore;

before(async () => {
  const secret = randomString(32);

  redis = new IORedis();
  store = new RedisStore(secret, redis);
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

    await timeout("110ms");
    const val = await redis.get(token);

    expect(val).to.be.null;
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
  });

  it("should return null after the token expires", async () => {
    const token = await store.commision(faker.internet.userName(), faker.internet.email(), "100ms");

    await timeout("110ms");
    const val = await store.peek(token);

    expect(val).to.be.null;
  });
});
