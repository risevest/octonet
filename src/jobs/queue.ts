import { Redis } from "ioredis";
import { injectable } from "inversify";
import { retryOnError } from "../retry";

const queueAction = <const>["skipped"];
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

  async work(f: (t: T, skip?: () => Promise<void>) => Promise<void>) {
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
      };

      await retryOnError(3, "0.3s", () => f(JSON.parse(entries[0]), skip));

      switch (action) {
        case "skipped":
          continue;
        default:
          await this.redis.lpop(this.name);
          break;
      }
    }
  }
}
