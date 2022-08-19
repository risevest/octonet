import { Redis } from "ioredis";
import { injectable } from "inversify";

const queueAction = <const>["processed", "skipped", "requeued"];
export type QueueAction = typeof queueAction[number];

@injectable()
export class RedisQueue<T> {
  constructor(private name: string, private redis: Redis, private maxRequeues = 2) {}

  async fill(ts: T[]) {
    const length = await this.length();
    if (length > 0) {
      return false;
    }

    const instructions = ts.map(t => ["rpush", this.name, JSON.stringify(t)]);
    await this.redis.multi(instructions).exec();
    this.maxRequeues = ts.length;
  }

  async length() {
    return await this.redis.llen(this.name);
  }

  async skip() {
    return await this.redis.lpop(this.name);
  }

  async requeue() {
    const item = await this.skip();
    return await this.redis.rpush(this.name, item);
  }

  async work(f: (t: T, skip: () => Promise<string>, requeue: () => Promise<number>) => Promise<QueueAction>) {
    const length = await this.length();
    let retries = 0;

    for (let index = 0; index < length; index++) {
      if (retries > this.maxRequeues) {
        return;
      }

      const entries = await this.redis.lrange(this.name, 0, 0);

      // first empty entry is sign we should skip
      if (entries.length === 0) {
        return;
      }

      const action = await f(JSON.parse(entries[0]), this.skip, this.requeue);
      switch (action) {
        case "processed":
          // clean it off
          await this.redis.lpop(this.name);
          break;
        case "skipped":
          continue;
        case "requeued":
          // adds an additional loop
          index -= 1;
          // prevents an infinite loop
          retries += 1;
          break;
      }

      // await this.redis.lpop(this.name);
    }
  }
}
