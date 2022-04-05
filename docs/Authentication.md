# Authentication

This section describes how Authentication is performed in Octonet.

## Introduction

The Authentication module in Octonet exists for 2 main reasons:

- User session management
- System session management

These involve managing sessions for requests initiated by the user or the system. Usually, a session token is provided in the request header through which a session object is obtained.

One way through which a user session can be differentiated from a system session is the `scheme` value. This is depicted as shown below.

```js
// express request headers.

// general format
req.headers.authorization = `${scheme} ${token}`;

// request header for a user session with a `Bearer` scheme
req.headers.authorization = `Bearer ${token}`;

// request header for a system session with a custom-defined scheme
req.headers.authorization = `Rise ${token}`;
```

> Note that a user can only have a **single** token in Redis store at any point in time. This is because the cryptographic function for generating a token is **idempotent**. Hence, it returns the same value regardless of the number of times the function is being called.

## Utility methods

There are 4 main utility functions through which token-related actions for authentication are performed in Octonet. They are discussed below:

### commision<T = any>(key: string, val: T, time: string): Promise<string>

The _commission_ function creates a cryptographic token using a secret and a specified key, and saves the data for that key in Redis. The saved data can be accessed via the token.

#### Parameters

**key:** A unique key string for generating the token
**value:** The value to be referenced with the token. Typically, this is the session object
**time:** The lifespan (expiry time) of the token, formatted in accordance with specifications contained in the [ms](https://github.com/vercel/ms#readme) library (see reference section at the end of this document).

#### Return value

It returns a promise that resolves to the created token.

### peek<T = any>(token: string): AsyncNullable<T>

The _peak_ function retrieves the session object from Redis which the token points to. However, it doesn't change the validity of the token.

#### Parameters

**token:** the cryptographic token

#### Return value

Returns the session object for the given token from Redis (if found) or `null` if there is no object referenced by that token.

### extend<T = any>(token: string, time: string): AsyncNullable<T>

The _extend_ function resets the expiry time of a specified token.

#### Parameters

**token:** The reference token
**time:** The new expiry time, formatted in accordance with specifications contained in the [ms](https://github.com/vercel/ms#readme) library.

#### Return value

Returns the session object for the given token from Redis (if found) or `null` if there is no object referenced by that token.

### reset<T = any>(key: string, newVal: T): Promise<void>

The _reset_ function replaces the content a token points to with a new content. The token is gotten from the unique _key_ with which it was initially created.

#### Parameters

**key:** The unique key with which the token was initially created
**newVal:** The new content that the token should reference.

#### Return value

No return value

### decommission<T = any>(token: string): AsyncNullable<T>

The _decomission_ function deletes a token from the Redis store and returns the content the token was pointing to (if it exists) prior to being decomissioned.

#### Parameters

**token:** The token to be decomissioned

#### Return value

Returns the content referenced by the token (if it exists) or `null` otherwise.

### revoke(key: string): Promise<void>

The _revoke_ function deletes a token and its referenced content from Redis without returning the referenced content.

#### Parameters

**key:** The unique key with which the token was initially created

#### Return value

No return value

## Practical examples

Let's look at practial applications of these utility functions.

### Step 1: create a Redis Client

First, we create a Redis client.

```js
// redis.config.ts

import IORedis from "ioredis";
import Logger from "./logger";

const redis_url = "redis://localhost:6379"; // read this from your .env file
const Redis = new IORedis(redis_url);

Redis.on("error", err => {
  Logger.error(err, "An error occured with the Redis client.");
});

export default Redis;
```

### Step 2: create and use `RedisStore` instance

Next, we create and Octonet's `RedisStore` instance as shown below

```js
// redis.store.ts

import { RedisStore } from "@risemaxi/octonet";
import Redis from "./redis.config";

const SECRET = "my_secret"; // use the secret specified in your .env file
const key = "user@example.com"; // unique key

// sample session object
const session = {
  id: 1,
  email: "user@example.com",
  role: "user"
};

const redisStore: RedisStore = new RedisStore(SECRET, Redis);

// sample immediately invoking start function for the purpose of this example
(async function () {
  // create a token with an expiry time of 1 hour
  const token: string = await redisStore.commission(key, session, "1h"); // returns a cryptographic token

  // view the object referenced by the token (in this case, it's the session object created above)
  const storedSession = await redisStore.peek(token);

  // reset the expiry time for the token to 30 mins
  await redisStore.extend(token, "30m");

  // reset the object referenced by the token
  const newSession = {
    id: 1,
    email: "anotherUser@example.com",
    role: "user"
  };

  /* reset the token.
   * after this function has been called, redisStore.peek(token) === newSession
   */
  await redisStore.reset(key, newSession);

  /* decommission a token
   *  after this function has been called, redisStore.peek(token) === null
   */
  await redisStore.decommission(token);

  /* revoke a token
   *  after this function has been called, redisStore.peek(token) === null
   */
  await redisStore.revoke(key);
})();
```
