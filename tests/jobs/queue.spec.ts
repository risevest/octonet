import "reflect-metadata";

import { expect, use } from "chai";

import Redis from "ioredis";
import { RedisQueue } from "../../src/jobs/queue";
import chaiAsPromised from "chai-as-promised";

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

  it("allow generator as input", async () => {
    const jobs1 = Array.from({ length: 10 }).map((_x, i) => i + 1);
    const jobs2 = Array.from({ length: 10 }).map((_x, i) => i + 11);

    await queue.fill(async function* () {
      yield jobs1;
      yield jobs2;
    }());

    const entries = await redis.lrange(queueName, 0, -1);
    expect(entries).to.have.length(20);

    entries.forEach((e, i) => {
      expect(e).to.eq(String(i + 1));
    });
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
