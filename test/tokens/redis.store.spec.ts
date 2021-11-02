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

describe("RedisStore#extend", () => {
  it("should not be able reset the expiry time of an expired token", async () => {
    const data = faker.internet.email();
    const token = await store.commision(faker.internet.userName(), data, "50ms");

    await timeout("70ms");
    let val = await store.peek(token);
    let ttl = await redis.pttl(token);

    expect(ttl).to.eql(-2);
    expect(val).to.be.null;

    const tokenValue = await store.extend(token, "200ms");
    expect(tokenValue).to.be.null;
  });

  it("should reset the expiry time of the token", async () => {
    const data = faker.internet.email();
    const token = await store.commision(faker.internet.userName(), data, "200ms");

    await timeout("70ms");
    let val = await store.peek(token);
    let ttl = await redis.pttl(token);

    expect(ttl).to.be.gte(100);
    expect(val).to.not.be.null;
    expect(val).to.eql(data);

    let tokenValue = await store.extend(token, "200ms");
    await timeout("70ms");

    val = await store.peek(token);
    ttl = await redis.pttl(token);

    expect(ttl).to.be.gte(100).and.lt(200);
    expect(val).to.not.be.null;
    expect(val).to.eql(data);
    expect(tokenValue).to.eql(data);

    await timeout("130ms");

    val = await store.peek(token);
    ttl = await redis.pttl(token);

    expect(ttl).to.eql(-2);
    expect(val).to.be.null;
  });
});
