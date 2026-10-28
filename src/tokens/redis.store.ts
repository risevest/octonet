import crypto from "crypto";

import { Redis } from "ioredis";
import ms from "ms";

import { dateReviver } from "../strings";
import { AsyncNullable, TokenStore } from "./store";

/**
 * Tokens are always the lowercase hex digest of an HMAC-SHA256, so anything
 * else can never have been produced by `commission` and must not be looked up:
 * the store shares its redis database with other keys (sessions, caches,
 * rate limits) and a caller-supplied key name must not resolve to one of them.
 */
function isTokenShaped(token: string) {
  return /^[a-f0-9]{64}$/.test(token);
}

export class RedisStore implements TokenStore {
  constructor(private secret: string, private redis: Redis) {}

  /**
   * @deprecated Use `commission()` instead. This method has a typo in its name and will be removed in a future version.
   */
  async commision<T = any>(key: string, val: T, time: string): Promise<string> {
    // Delegate to the correctly-spelled method
    return this.commission(key, val, time);
  }

  async commission<T = any>(key: string, val: T, time: string): Promise<string> {
    const token = crypto.createHmac("sha256", this.secret).update(key).digest("hex");

    const content = JSON.stringify(val);
    await this.redis.set(token, content, "PX", ms(time));

    return token;
  }

  async peek<T = any>(token: string): AsyncNullable<T> {
    if (!isTokenShaped(token)) {
      return null;
    }

    const result = await this.redis.get(token);
    if (!result) {
      return null;
    }

    return JSON.parse(result, dateReviver);
  }

  async extend<T = any>(token: string, time: string): AsyncNullable<T> {
    if (!isTokenShaped(token)) {
      return null;
    }

    const result = await this.redis.get(token);
    if (!result) {
      return null;
    }

    await this.redis.pexpire(token, ms(time));

    return JSON.parse(result, dateReviver);
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
    if (!isTokenShaped(token)) {
      return null;
    }

    const result = await this.redis.get(token);
    if (!result) {
      return null;
    }

    await this.redis.del(token);

    return JSON.parse(result, dateReviver);
  }

  async revoke(key: string): Promise<void> {
    const token = crypto.createHmac("sha256", this.secret).update(key).digest("hex");

    await this.redis.del(token);
  }
}
