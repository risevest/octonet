import crypto from "crypto";
import { Redis } from "ioredis";
import ms from "ms";
import { AsyncNullable, TokenStore } from "./store";

export class RedisStore implements TokenStore {
  constructor(private secret: string, private redis: Redis) {}

  async commision<T = any>(key: string, val: T, time: string): Promise<string> {
    const token = crypto.createHmac("sha256", this.secret).update(key).digest("hex");

    const content = JSON.stringify(val);
    await this.redis.set(token, content, "PX", ms(time));

    return token;
  }

  async peek<T = any>(token: string): AsyncNullable<T> {
    const result = await this.redis.get(token);
    if (!result) {
      return null;
    }

    return JSON.parse(result);
  }

  async extend<T = any>(token: string, time: string): AsyncNullable<T> {
    const result = await this.redis.get(token);
    if (!result) {
      return null;
    }

    await this.redis.pexpire(token, ms(time));

    return JSON.parse(result);
  }

  async reset<T = any>(key: string, newVal: T): Promise<void> {
    const token = crypto.createHmac("sha256", this.secret).update(key).digest("hex");

    // make sure the token exists
    const result = await this.redis.get(token);
    if (!result) return;

    const content = JSON.stringify(newVal);
    const ttl = await this.redis.pttl(token);

    await this.redis.set(token, content, "PX", ttl);
  }

  async decommission<T = any>(token: string): AsyncNullable<T> {
    const result = await this.redis.get(token);
    if (!result) {
      return null;
    }

    await this.redis.del(token);

    return JSON.parse(result);
  }

  async revoke(key: string): Promise<void> {
    const token = crypto.createHmac("sha256", this.secret).update(key).digest("hex");

    await this.redis.del(token);
  }
}
