export type AsyncNullable<T> = Promise<T | null>;

/**
 * Contract of stores used to manage single use tokens. What's most important of
 * said tokens(vs JWT for instance) is the ability to revoke said token.
 */
export interface TokenStore {
  /**
   * Create a single use token that expires after the given timeout
   * @param key key to enabled reset and revoke
   * @param val value the token will refer to
   * @param time timeout before expiry
   */
  commision<T = any>(key: string, val: T, time: string): Promise<string>;
  /**
   * Get the data the token references without changing its lifetime
   * @param token token to check for
   */
  peek<T = any>(token: string): AsyncNullable<T>;
  /**
   * Set the new duration before an existing token times out. Note that it doesn't
   * take into account how long the old token had to expire, as it uses the new duration
   * entirely.
   * @param token generated token
   * @param time the new expiry duration of the token
   */
  extend<T = any>(token: string, time: string): AsyncNullable<T>;
  /**
   * Change the contents of the token without changing it's TTL
   * @param key key used to generate the token
   * @param newVal value to replace token content
   */
  reset<T = any>(key: string, newVal: T): Promise<boolean>;
  /**
   * Load the value referenced by the token and dispenses of the token,
   * making it unvailable for further use.
   * @param token token to be decomissioned
   */
  decommission<T = any>(token: string): AsyncNullable<T>;
  /**
   * Render the token generated for the given key useless.
   * @param key key used to generate the token
   */
  revoke(key: string): Promise<void>;
}
