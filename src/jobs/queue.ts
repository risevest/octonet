import { injectable } from "inversify";
import Redis from "ioredis";

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

  async work(f: (t: T) => Promise<void>) {
    const length = await this.length();
    for (let index = 0; index < length; index++) {
      const entries = await this.redis.lrange(this.name, 0, 0);

      // first empty entry is sign we should skip
      if (entries.length === 0) {
        return;
      }

      await f(JSON.parse(entries[0]));

      // clean it off
      await this.redis.lpop(this.name);
    }
  }
}
