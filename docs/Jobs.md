# Jobs

The jobs module provides a decorator-based system for scheduling and running cron jobs with support for distributed locking, retry logic, and Redis-backed queuing. It's built on top of InversifyJS for dependency injection and uses `node-cron` for scheduling.

## Table of Contents

- [Overview](#overview)
- [Core Concepts](#core-concepts)
- [Quick Start](#quick-start)
- [Decorators](#decorators)
- [Configuration](#configuration)
- [JobRunner](#jobrunner)
- [RedisQueue](#redisqueue)
- [Distributed Locking](#distributed-locking)
- [Advanced Usage](#advanced-usage)
- [Best Practices](#best-practices)

## Overview

The jobs system supports two types of scheduled tasks:

1. **Simple Jobs**: Execute a single function on a schedule
2. **Query Jobs**: Generate a list of items via a query, then process each item through a job handler

Both types support:

- Configurable retry logic
- Distributed locking for multi-instance deployments
- Redis-backed queuing for reliable job processing
- Automatic error handling and logging

## Core Concepts

### Job Groups

Jobs are organized into groups using the `@cron` decorator. A job group is a class that contains related job methods.

### Query and Job Pairs

For processing multiple items:

- **Query**: A method that generates a list of items to process
- **Job**: A method that processes each individual item

The query and job must share the same name to be paired together.

### Scheduling

Jobs are scheduled using cron expressions. The module provides convenient decorators for common schedules.

## Quick Start

### Basic Setup

```typescript
import { cron, daily, Logger } from "octonet";
import { Container } from "inversify";
import { Redis } from "ioredis";
import { JobRunner } from "octonet/jobs/runner";

// 1. Define a job group
@cron("my-jobs")
class MyJobs {
  @daily("cleanup")
  async cleanupJob() {
    console.log("Running daily cleanup");
    // Your cleanup logic here
  }
}

// 2. Set up the runner
const container = new Container();
const redis = new Redis("redis://localhost:6379");
const logger = new Logger({ name: "jobs" });

const runner = new JobRunner(container);
await runner.start(redis, logger);
```

### Query-Based Job

```typescript
import { cron, job, query } from "octonet";

@cron("user-jobs")
class UserJobs {
  // Query generates the list of items
  @query("send-notifications")
  async getUsersToNotify() {
    // Return list of users to process
    return await db.getActiveUsers();
  }

  // Job processes each item from the query
  @job("send-notifications", "0 9 * * *") // Daily at 9 AM
  async sendNotification(user: User) {
    await emailService.send(user.email, "Daily Update");
  }
}
```

## Decorators

### @cron(name: string)

Marks a class as a job group. The class will be automatically made injectable.

**Parameters:**

- `name`: Unique identifier for the job group

```typescript
@cron("notifications")
class NotificationJobs {
  // Job methods here
}
```

### @job(name: string, schedule: string, config?: JobConfig)

Marks a method as a job handler that runs on a schedule.

**Parameters:**

- `name`: Job identifier (must match query name if using query-job pairing)
- `schedule`: Cron expression (e.g., `'0 0 * * *'` for daily at midnight)
- `config`: Optional configuration object

```typescript
@job('process-orders', '*/15 * * * *', {
  retries: 3,
  timeout: '30s',
  maxComputeTime: '2h'
})
async processOrders(order?: Order) {
  // Process order
}
```

### @query(name: string)

Marks a method as a data generator for a job. Must have the same name as the corresponding `@job`.

**Parameters:**

- `name`: Must match the job name

```typescript
@query('process-orders')
async getPendingOrders() {
  return await db.orders.findPending();
}
```

### Convenience Decorators

Pre-configured decorators for common schedules:

#### @hourly(name: string, config?: JobConfig)

Runs every hour (at minute 0).

```typescript
@hourly('sync-data')
async syncData() {
  // Runs at 00:00, 01:00, 02:00, etc.
}
```

#### @daily(name: string, config?: JobConfig)

Runs daily at midnight.

```typescript
@daily('cleanup')
async cleanup() {
  // Runs at 00:00 every day
}
```

#### @weekly(name: string, config?: JobConfig)

Runs weekly on Sunday at midnight.

```typescript
@weekly('reports')
async generateWeeklyReport() {
  // Runs at 00:00 every Sunday
}
```

#### @monthly(name: string, config?: JobConfig)

Runs monthly on the 1st at midnight.

```typescript
@monthly('billing')
async processBilling() {
  // Runs at 00:00 on the 1st of each month
}
```

## Configuration

### JobConfig

Configuration object for jobs:

```typescript
interface JobConfig {
  /**
   * Number of times to retry a job. Set to 0 to not retry.
   * @default 0
   */
  retries?: number;

  /**
   * Minimum amount of time to wait between retries.
   * @default "10s"
   */
  timeout?: string;

  /**
   * How long a job would take. Used for distributed locking.
   * @default "1h"
   */
  maxComputeTime?: string;
}
```

**Time Format:** Uses the `ms` package format (e.g., `'10s'`, `'5m'`, `'1h'`, `'2d'`)

### Example Configurations

```typescript
// High-priority job with aggressive retries
@job('critical-sync', '*/5 * * * *', {
  retries: 5,
  timeout: '5s',
  maxComputeTime: '10m'
})

// Long-running job with no retries
@job('heavy-computation', '0 2 * * *', {
  retries: 0,
  maxComputeTime: '4h'
})
```

## JobRunner

The `JobRunner` class manages job lifecycle and execution.

### Constructor

```typescript
new JobRunner(container: Container)
```

**Parameters:**

- `container`: InversifyJS container with job groups

### Methods

#### start(redis: Redis, logger: Logger)

Starts all scheduled jobs and processes any pending queue items.

```typescript
const runner = new JobRunner(container);
await runner.start(redis, logger);
```

#### run(job: string)

Manually triggers a specific job.

```typescript
runner.run("notifications.send-daily");
```

#### stop(job?: string)

Stops scheduled tasks. Optionally specify a job name to stop only that job.

```typescript
// Stop all jobs
runner.stop();

// Stop specific job
runner.stop("notifications.send-daily");
```

**Note:** Jobs currently running will complete; only future schedules are cancelled.

### Complete Example

```typescript
import { Container } from "inversify";
import { Redis } from "ioredis";
import { Logger } from "octonet";
import { JobRunner } from "octonet/jobs/runner";

const container = new Container();
const redis = new Redis(process.env.REDIS_URL);
const logger = new Logger({ name: "job-runner" });

const runner = new JobRunner(container);

// Start all jobs
await runner.start(redis, logger);

// Manually trigger a job
runner.run("my-jobs.cleanup");

// Graceful shutdown
process.on("SIGTERM", () => {
  runner.stop();
  redis.quit();
});
```

## RedisQueue

A Redis-backed queue for processing jobs in serial order with retry support.

### Constructor

```typescript
new RedisQueue<T>(
  name: string,
  redis: Redis,
  retries?: number,
  timeout?: string
)
```

**Parameters:**

- `name`: Queue identifier
- `redis`: Redis instance
- `retries`: Number of retry attempts (default: 3)
- `timeout`: Minimum time between retries (default: '10s')

### Methods

#### fill(items: T[] | AsyncGenerator<T[]>)

Adds items to the queue. Won't add if queue already has items.

```typescript
const queue = new RedisQueue("emails", redis);
await queue.fill([user1, user2, user3]);

// Or with async generator
async function* getUsers() {
  for (const batch of largeUserList) {
    yield batch;
  }
}
await queue.fill(getUsers());
```

**Returns:** `boolean` - `true` if items were added, `false` if queue already had items

#### work(handler: (t: T) => Promise<void>, logger?: Logger, parallelism?: number)

Processes all items in the queue using the provided handler.

```typescript
await queue.work(
  async user => {
    await sendEmail(user);
  },
  logger,
  5 // Process 5 items in parallel
);
```

**Parameters:**

- `handler`: Async function to process each item
- `logger`: Optional logger for tracking
- `parallelism`: Number of concurrent workers (default: 1)

#### length()

Returns the number of items remaining in the queue.

```typescript
const count = await queue.length();
```

#### requeue()

Moves failed jobs from the dead-letter queue back to the main queue.

```typescript
const hadFailures = await queue.requeue();
```

**Returns:** `boolean` - `true` if there were failed jobs to requeue

### Standalone Usage

You can use `RedisQueue` independently of the job system:

```typescript
import { RedisQueue } from "octonet/jobs/queue";
import { Redis } from "ioredis";

const redis = new Redis();
const queue = new RedisQueue<Order>("orders", redis, 3, "10s");

// Producer
await queue.fill(await getOrders());

// Consumer
await queue.work(
  async order => {
    await processOrder(order);
  },
  logger,
  10
);
```

## Distributed Locking

The jobs system uses Redis-based distributed locks to ensure only one instance processes a job at a time.

### acquireLock

```typescript
async function acquireLock(redis: Redis, group: string, owner: string, period: string): Promise<boolean>;
```

Attempts to acquire a distributed lock.

**Parameters:**

- `redis`: Redis instance
- `group`: Lock group/name
- `owner`: Unique ID of the requester
- `period`: How long to hold the lock (e.g., `'5m'`)

**Returns:** `true` if lock was acquired, `false` otherwise

```typescript
import { acquireLock } from "octonet/jobs/runner";

const lockAcquired = await acquireLock(redis, "critical-job", processId, "10m");

if (lockAcquired) {
  // Execute critical section
}
```

### releaseLock

```typescript
async function releaseLock(redis: Redis, group: string, owner: string): Promise<boolean>;
```

Releases a lock if the caller owns it.

**Parameters:**

- `redis`: Redis instance
- `group`: Lock group/name
- `owner`: Unique ID of the requester

**Returns:** `true` if lock was released, `false` if not owned or expired

```typescript
import { releaseLock } from "octonet/jobs/runner";

await releaseLock(redis, "critical-job", processId);
```

### Lock Behavior

- Locks automatically expire after the specified period
- Only the lock owner can release it
- If a lock expires, another process can acquire it
- The job system automatically handles locking for scheduled jobs

## Advanced Usage

### Multiple Job Groups

```typescript
@cron("notifications")
class NotificationJobs {
  @daily("email-digest")
  async sendDigest() {
    // ...
  }
}

@cron("analytics")
class AnalyticsJobs {
  @hourly("track-metrics")
  async trackMetrics() {
    // ...
  }
}

// Both groups will be automatically registered
const runner = new JobRunner(container);
```

### Dependency Injection

Job classes support full dependency injection:

```typescript
@cron("orders")
class OrderJobs {
  @inject(OrderService) private orderService: OrderService;
  @inject(EmailService) private emailService: EmailService;

  @query("process-pending")
  async getPendingOrders() {
    return this.orderService.findPending();
  }

  @job("process-pending", "*/10 * * * *")
  async processOrder(order: Order) {
    await this.orderService.process(order);
    await this.emailService.sendConfirmation(order);
  }
}
```

### Complex Scheduling

Use full cron syntax for custom schedules:

```typescript
// Every 15 minutes during business hours (9 AM - 5 PM) on weekdays
@job('sync', '*/15 9-17 * * 1-5')
async syncData() {
  // ...
}

// At 2:30 AM on the 1st and 15th of each month
@job('semi-monthly', '30 2 1,15 * *')
async semiMonthlyReport() {
  // ...
}
```

### Error Handling

Jobs automatically retry based on configuration, but you can also handle errors explicitly:

```typescript
@job('resilient-job', '0 * * * *', { retries: 3, timeout: '30s' })
async resilientJob(item: Item) {
  try {
    await processItem(item);
  } catch (error) {
    // Custom error handling
    if (error.code === 'CRITICAL') {
      await alertTeam(error);
      throw error; // Will trigger retry
    }
    // Non-critical errors can be logged without retrying
    logger.warn(error, { item });
  }
}
```

### Async Generators for Large Datasets

For memory-efficient processing of large datasets:

```typescript
@cron("big-data")
class BigDataJobs {
  @query("process-millions")
  async *getRecords() {
    let offset = 0;
    const batchSize = 1000;

    while (true) {
      const batch = await db.getRecords(offset, batchSize);
      if (batch.length === 0) break;

      yield batch;
      offset += batchSize;
    }
  }

  @job("process-millions", "0 3 * * *", { maxComputeTime: "6h" })
  async processRecord(record: Record) {
    await processLargeRecord(record);
  }
}
```

## Best Practices

### 1. Choose Appropriate maxComputeTime

Set `maxComputeTime` based on realistic job duration to prevent lock contention:

```typescript
// Short job - 10 minutes is plenty
@job('quick-sync', '*/5 * * * *', { maxComputeTime: '10m' })

// Long job - give it enough time
@job('data-migration', '0 2 * * *', { maxComputeTime: '4h' })
```

### 2. Use Retries Wisely

- Set `retries: 0` for idempotent operations where failures can be skipped
- Use higher retry counts for critical operations
- Set appropriate `timeout` to avoid immediate retries

```typescript
// Critical with retries
@job('payment-processing', '*/5 * * * *', {
  retries: 5,
  timeout: '30s'
})

// Non-critical, no retries
@job('cache-warmup', '0 * * * *', {
  retries: 0
})
```

### 3. Naming Conventions

Use descriptive, hierarchical names:

```typescript
@cron('user-management')
class UserJobs {
  @daily('user-management.cleanup-inactive')
  // Job name will be: "user-management.cleanup-inactive"
}
```

### 4. Monitor Queue Length

Check queue length to monitor job health:

```typescript
@cron("monitoring")
class MonitoringJobs {
  @hourly("check-queues")
  async checkQueues() {
    const queue = new RedisQueue("critical-jobs", redis);
    const length = await queue.length();

    if (length > 1000) {
      await alertTeam("Queue backlog detected");
    }
  }
}
```

### 5. Graceful Shutdown

Always stop jobs gracefully:

```typescript
const cleanup = async () => {
  runner.stop(); // Stop scheduling new jobs
  await redis.quit(); // Close Redis connection
  process.exit(0);
};

process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);
```

### 6. Handle Query Failures

Ensure queries are resilient:

```typescript
@query('fetch-data')
async fetchData() {
  try {
    return await externalAPI.getData();
  } catch (error) {
    logger.error('Query failed', error);
    return []; // Return empty array to prevent job failure
  }
}
```

### 7. Use Parallelism Appropriately

Balance throughput with resource usage:

```typescript
// CPU-intensive: low parallelism
await queue.work(cpuHeavyTask, logger, 2);

// I/O-bound: higher parallelism
await queue.work(apiCall, logger, 20);
```

### 8. Test Jobs Independently

Jobs can be tested without the scheduler:

```typescript
describe("OrderJobs", () => {
  it("should process orders", async () => {
    const jobs = new OrderJobs(orderService, emailService);
    const orders = await jobs.getPendingOrders();

    for (const order of orders) {
      await jobs.processOrder(order);
    }

    expect(orderService.process).toHaveBeenCalled();
  });
});
```

## See Also

- [Logging](https://github.com/risevest/octonet/blob/master/docs/Logging.md) - For job logging and monitoring
- [AMQP](https://github.com/risevest/octonet/blob/master/docs/AMQP.md) - For message queue-based job patterns
- [Redis](https://redis.io/commands) - Redis commands reference
- [node-cron](https://www.npmjs.com/package/node-cron) - Cron expression syntax
