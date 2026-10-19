# Changelog

## 0.14.0

Retries requested with `RetryError` are now bounded and backed off on both NATS and AMQP ([#136](https://github.com/risevest/octonet/issues/136)).

### Behaviour changes

- **NATS redeliveries are bounded.** A message is delivered at most `max_deliver` times (default `5`), then terminated with an error log. Before this, a `RetryError` message was redelivered every `timeout` forever. Durable consumers that already exist are updated to the new `max_deliver` and `ack_wait` on start.
- **NATS retries are backed off.** A `RetryError` message is nak'd with the next `backoff` delay instead of waiting for `timeout`.
- **NATS consumers keep pulling while messages retry.** Before this, a retrying message stopped the consumer from asking for its next batch.
- **AMQP retries no longer hold a prefetch slot.** A `RetryError` job is moved to `<QUEUE>_RETRY_<ms>` and acked. It comes back to `<QUEUE>` after the delay, and goes to `<QUEUE>_DEAD` after `max_attempts` (default `5`). Before this, the job stayed unacked and blocked its queue.
- **Errors thrown under stacked middleware now propagate.** With two or more middleware on a handler, its errors were swallowed and the message was acked as a success. They now reach the consumer, so a `RetryError` thrown there is retried.

### Added

- `NatsConfig.max_deliver` and `NatsConfig.backoff`.
- `RetryConfig` (`max_attempts`, `backoff`) as the 4th argument of `Workers.start`.
- `DeliveryInfo` (`attempt`, `max_attempts`), passed to every NATS subscriber and AMQP command as its second argument.

### Upgrading

- Set `max_deliver`/`backoff` and `RetryConfig` explicitly in each service, and check the defaults suit your handlers.
- Handlers that depend on unlimited redelivery should record their failure when `attempt === max_attempts`.
- Watch `<QUEUE>_DEAD` queues for jobs that ran out of attempts.
