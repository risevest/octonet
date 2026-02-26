# Logger

The Logger is a feature in Octonet which provides utility functions that enables logging for the purpose of distributed tracing, metrics collection or other purposes. It utilises the [Bunyan](https://github.com/trentm/node-bunyan#readme) library for its functionalities,as well as the [Express](https://expressjs.com/en/api.html#express) [Request](https://expressjs.com/en/api.html#req) and [Response](https://expressjs.com/en/api.html#res) objects as inputs.

## Utility Functions

The utility functions are as described below:

### request(req: Request)

The _request_ function logs an incoming HTTP request.

#### Parameters

**req:** Express request object

### response(res: Response)

The _response_ function logs an outgoing HTTP response

#### Parameters

**res:** Express request object

### httpError(err: Error, req: Request, res: Response)

The _httpError_ function Logs an error that occured during the handling of an HTTP request.

#### Parameters

**err:** Error object
**req:** Express request object
**res:** Express response object

### axiosRequest(req: AxiosRequestConfig)

The _axiosRequest_ function logs an axios request

#### Parameters

**req:** [AxiosRequestConfig](https://axios-http.com/docs/req_config) object

### axiosResponse(res: AxiosResponse)

The _axiosResponse_ function logs response to axios request

#### Parameters

**res:** [AxiosResponse](https://axios-http.com/docs/res_schema) object

### axiosError(err: AxiosError)

The _axiosError_ function logs error response to axios request

#### Parameters

**err:** [AxiosError](https://axios-http.com/docs/handling_errors) object

### log(entry: string | object)

The _log_ message logs simple messages

#### Parameters

**entry:** Entry message to be logged

### error(entry: string | LogError)

The _error_ function logs internal application error.

#### Parameters

**entry:** additional error description

## Distributed Tracing

The Logger supports opt-in distributed tracing via the `TracingProvider` interface. When configured, every log entry is automatically enriched with `trace_id` and `span_id` fields, enabling correlation between logs and traces in tools like Grafana (Loki + Tempo).

### TracingProvider Interface

Octonet defines a provider-agnostic interface — no tracing dependencies are added to octonet itself. Services supply their own implementation (OpenTelemetry, Datadog, etc.):

```ts
import { TracingProvider, TraceContext } from "@risemaxi/octonet";

interface TraceContext {
  traceId: string;
  spanId: string;
  traceFlags?: number;
}

interface TracingProvider {
  getActiveTraceContext(): TraceContext | null;
}
```

### Enabling Tracing

Pass a `TracingProvider` to the Logger config:

```ts
const logger = new Logger({
  name: "rise-analytics",
  serializers: defaultSerializers(),
  tracing: myTracingProvider  // opt-in
});
```

When `tracing` is omitted or undefined, the Logger behaves exactly as before — no trace fields are added.

### OpenTelemetry Example

For services using OpenTelemetry:

```ts
import { trace } from "@opentelemetry/api";
import { TracingProvider } from "@risemaxi/octonet";

export const otelTracingProvider: TracingProvider = {
  getActiveTraceContext() {
    const span = trace.getActiveSpan();
    if (!span) return null;
    const { traceId, spanId, traceFlags } = span.spanContext();
    return { traceId, spanId, traceFlags };
  }
};
```

Then pass it to the Logger:

```ts
const logger = new Logger({
  name: env.service_name,
  serializers: defaultSerializers(),
  tracing: otelTracingProvider
});
```

### How It Works

- The `TracingProvider.getActiveTraceContext()` is called on every log call
- If it returns a context, `trace_id` and `span_id` are injected into the log entry
- If it returns `null` (no active span), no trace fields are added
- Child loggers created via `logger.child()` inherit the tracing provider
- This works across HTTP handlers, AMQP workers, NATS consumers, and cron jobs — anywhere the tracing library maintains an active span context

### Log Output

With tracing enabled, log entries include trace fields:

```json
{
  "name": "rise-analytics",
  "msg": "successfully connected to redis",
  "trace_id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
  "span_id": "1a2b3c4d5e6f7a8b",
  "level": 30,
  "time": "2026-02-26T12:00:00.000Z"
}
```

These fields enable "Logs for this span" links in Grafana Tempo, connecting traces to their corresponding log entries in Loki.

## Practical examples

Let's look at practical examples of the Logger module

```js
import express from "express";
import { Logger, defaultSerializers } from "@risemaxi/octonet";

// create the Logger instance
const logger: Logger = new Logger({
  name: "wallet_demo",
  serializers: defaultSerializers("password"),
  verbose: false
});

// Express-related Logger utility functions
app.get("/test", (err, req, res) => {
  logger.request(req);
  logger.response(res);
  logger.httpError(err, req, res);
});

// axios-related utility functions

// others
logger.log("transactionn service called");
logger.error("an internal server error has occured");
```
