import "reflect-metadata";

import { expect, use } from "chai";

import Redis from "ioredis";
import { RedisQueue } from "../../src/jobs/queue";
import { TestInstance } from "./helpers/queue";
import chaiAsPromised from "chai-as-promised";
import faker from "faker";
import { logger } from "../mq/nats.consumer.spec";
import { multiply } from "../helpers";

const redisURL = "redis://localhost:6379";
const queueName = "numbers_game";
let redis: Redis;
let queue: RedisQueue<number>;

use(chaiAsPromised);

beforeAll(() => {
  redis = new Redis(redisURL);
  queue = new RedisQueue(queueName, redis, 0);
});

afterAll(async () => {
  await redis.quit();
});

afterEach(async () => {
  await redis.flushdb();
});

describe("RedisQueue#fill", () => {
  it("writes jobs to a redis list", async () => {
    const jobs = Array.from({ length: 10 }).map((_x, i) => i + 1);

    await queue.fill(jobs);

    const entries = await redis.lrange(queueName, 0, -1);
    expect(entries).to.have.length(10);
    entries.forEach((e, i) => {
      expect(e).to.eq(String(i + 1));
    });
  });

  it("should not write any new jobs if list not empty", async () => {
    const jobs = Array.from({ length: 10 }).map((_x, i) => i + 1);

    await queue.fill(jobs);

    const newJobs = Array.from({ length: 10 }).map((_x, i) => i + 2);

    expect(queue.fill(newJobs)).to.eventually.be.false;
    expect(redis.lrange(queueName, 0, -1)).to.eventually.have.length(10);
  });
});

describe("RedisQueue#work", () => {
  it("should run a function on job entries", async () => {
    const jobs = Array.from({ length: 10 }).map((_x, i) => i + 1);
    await queue.fill(jobs);

    const results: number[] = [];
    await queue.work(async j => {
      results.push(j);
    });

    // confirm fifo
    jobs.forEach((e, i) => {
      expect(e).to.eq(results[i]);
    });

    expect(queue.length()).to.eventually.eq(0);
  });

  it("should run a work in parallel", async () => {
    const jobs = Array.from({ length: 10 }).map((_x, i) => i + 1);
    await queue.fill(jobs);

    const results: number[] = [];
    await queue.work(
      async j => {
        results.push(j);
      },
      undefined,
      5
    );

    // confirm fifo
    expect(results).to.have.length(jobs.length);
    jobs.forEach((e, i) => {
      expect(e).to.eq(results[i]);
    });

    const jobsLeft = await queue.length();
    expect(jobsLeft).to.be.eq(0);
  });

  it("should skip poisonous items", async () => {
    const jobs = Array.from({ length: 10 }).map((_x, i) => i + 1);
    await queue.fill(jobs);

    const results: number[] = [];

    await queue.work(async j => {
      if (j === 5) {
        throw new Error("exit");
      }

      results.push(j);
    });

    expect(results).to.have.length(9);
    expect(results.includes(5)).to.be.false;

    const key = `${queueName}:dead-letter`;
    expect(redis.hlen(key)).to.eventually.eq(1);
    const randomVal = await redis.hrandfield(key, 1, "WITHVALUES");
    expect(Number(randomVal?.[1])).to.eq(5);
  });

  it("should fail to utilize this in instance.greet()", async () => {
    const jobs = multiply(5, () => faker.name.firstName());

    const altQueue = new RedisQueue<string>("greetings", redis, 0);
    await altQueue.fill(jobs);

    const city = faker.address.cityName();
    const result: string[] = [];
    const instance = new TestInstance(city, result);

    await altQueue.work(instance.greet);
    expect(result).to.have.lengthOf(0);
  });

  it("should bind the worker argument to a specified instance", async () => {
    const jobs = multiply(5, () => faker.name.firstName());

    const altQueue = new RedisQueue<string>("greetings", redis, 0);
    await altQueue.fill(jobs);

    const city = faker.address.cityName();
    const result: string[] = [];
    const instance = new TestInstance(city, result);

    await altQueue.work(instance.greet, logger, 1, instance);
    expect(result).to.have.lengthOf(5);
  });
});

describe("RedisQueue#requeue", () => {
  it("should re-process failed jobs", async () => {
    const jobs = Array.from({ length: 10 }).map((_x, i) => i + 1);
    await queue.fill(jobs);

    await queue.work(async j => {
      if (j < 5) {
        throw new Error("exit");
      }
    });

    await expect(queue.requeue()).to.eventually.be.true;
    await expect(queue.length()).to.eventually.eq(4);

    const results: number[] = [];
    await queue.work(async j => {
      results.push(j);
    });

    results.forEach((e, i) => {
      expect(e).to.eq(i + 1);
    });
  });
});
