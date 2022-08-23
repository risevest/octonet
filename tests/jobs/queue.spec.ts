import "reflect-metadata";

import IORedis, { Redis } from "ioredis";

import { RedisQueue } from "../../src/jobs/queue";
import { expect } from "chai";
import { random } from "lodash";

const redisURL = "redis://localhost:6379";
const queueName = "numbers_game";
let redis: Redis;
let queue: RedisQueue<number>;

beforeAll(() => {
  redis = new IORedis(redisURL);
  queue = new RedisQueue(queueName, redis);
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

    const filled = await queue.fill(newJobs);

    expect(filled).to.be.false;

    const entries = await redis.lrange(queueName, 0, -1);
    expect(entries).to.have.length(10);
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

    const jobsLeft = await queue.length();
    expect(jobsLeft).to.be.eq(0);
  });

  it("should continue on retry", async () => {
    const jobs = Array.from({ length: 10 }).map((_x, i) => i + 1);
    await queue.fill(jobs);

    const results: number[] = [];
    try {
      await queue.work(async j => {
        if (j === 5) {
          throw new Error("exit");
        }

        results.push(j);
      });
    } catch (err) {}

    await queue.work(async j => {
      results.push(j);
    });

    expect(results).to.have.length(9);
    expect(results.includes(5)).to.be.false;
  });

  it("should skip an element on calling skip()", async () => {
    const jobs = Array.from({ length: 10 }).map((_x, i) => i + 1);
    await queue.fill(jobs);

    const results: number[] = [];
    await queue.work(async (j, skip) => {
      if (j === 7 && skip) {
        return skip();
      }

      results.push(j);
    });

    expect(results).to.have.length(9);
    expect(results.includes(7)).to.be.false;
  });

  it("should requeue an element", async () => {
    const jobs = Array.from({ length: 10 }).map((_x, i) => i + 1);
    await queue.fill(jobs);

    const results: number[] = [];
    await queue.work(async j => {
      const randomNum = random(1, 10, false);
      if (j === randomNum) {
        throw new Error();
      }

      results.push(j);
    });

    expect(results).to.have.length(10);
  });

  it("should skip requeue for an element after max attempts", async () => {
    const jobs = Array.from({ length: 10 }).map((_x, i) => i + 1);
    await queue.fill(jobs);

    const results: number[] = [];
    await queue.work(async j => {
      if (j === 4) {
        throw new Error();
      }

      results.push(j);
    });

    expect(results).to.have.length(9);
    expect(results.includes(4)).to.be.false;
  });
});
