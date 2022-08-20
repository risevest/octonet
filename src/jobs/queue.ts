import { Redis } from "ioredis";
import { injectable } from "inversify";

const queueAction = <const>["skipped", "requeued"];
export type QueueAction = typeof queueAction[number];

@injectable()
export class RedisQueue<T> {
  constructor(private name: string, private redis: Redis) {}

  async fill(ts: T[]) {
    const length = await this.length();
    if (length > 0) {
      return false;
    }

    const instructions = ts.map(t => ["rpush", this.name, JSON.stringify(t)]);
    return await this.redis.multi(instructions).exec();
  }

  async length() {
    return await this.redis.llen(this.name);
  }

  async work(f: (t: T, skip?: () => Promise<void>, requeue?: () => Promise<void>) => Promise<void>) {
    const length = await this.length();

    for (let index = 0; index < length; index++) {
      const entries = await this.redis.lrange(this.name, 0, 0);

      // first empty entry is sign we should skip
      if (entries.length === 0) {
        return;
      }

      let action: QueueAction;

      const skip = async () => {
        await this.redis.lpop(this.name);
        action = "skipped";
        return;
      };

      const requeue = async () => {
        await this.redis.rpush(this.name, entries[0]);
        action = "requeued";
        return;
      };

      await f(JSON.parse(entries[0]), skip, requeue);

      switch (action) {
        case "skipped":
          continue;
        case "requeued":
          await this.redis.lpop(this.name);
          // adds an additional loop
          index -= 1;
          break;
        default:
          await this.redis.lpop(this.name);
          break;
      }
    }
  }
}
