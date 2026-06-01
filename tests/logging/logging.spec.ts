import { Logger, TracingProvider, defaultSerializers } from "../../src";
import axios, { AxiosError } from "axios";

import Bunyan from "bunyan";
import { createLoggingApp } from "./server";
import { expect } from "chai";
import http from "http";

const ringbuffer = new Bunyan.RingBuffer({ limit: 5 });
const logger = new Logger({
  name: "logger_tests",
  buffer: ringbuffer,
  serializers: defaultSerializers("admin.password", "password", "Authorization", "X-Webhook-Secret")
});

const mockProvider: TracingProvider = {
  getActiveTraceContext() {
    return { traceId: "abc123", spanId: "def456", traceFlags: 1 };
  }
};

const traceBuffer = new Bunyan.RingBuffer({ limit: 5 });
const tracedLogger = new Logger({
  name: "traced_logger",
  buffer: traceBuffer,
  serializers: defaultSerializers(),
  tracing: mockProvider
});

const baseUrl = "http://localhost:3005";
const tracedBaseUrl = "http://localhost:3006";
let server: http.Server;
let tracedServer: http.Server;

beforeAll(() => {
  const app = createLoggingApp(logger);
  server = http.createServer(app).listen(3005);

  const tracedApp = createLoggingApp(tracedLogger);
  tracedServer = http.createServer(tracedApp).listen(3006);
});

afterAll(() => {
  return Promise.all([
    new Promise<void>((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()));
    }),
    new Promise<void>((resolve, reject) => {
      tracedServer.close(err => (err ? reject(err) : resolve()));
    })
  ]);
});

afterEach(() => {
  ringbuffer.records = [];
  traceBuffer.records = [];
});

describe("Bunyan#Request", () => {
  it("should be able to log a request", async () => {
    await axios.get(`${baseUrl}/req`);
    const properties = ringbuffer.records[0];
    expect(ringbuffer.records).to.be.length(1);
    expect(properties.req).to.have.property("method");
    expect(properties.req).to.have.property("url");
    expect(properties.req).to.have.property("headers");
    expect(properties.req).to.have.property("remoteAddress");
    expect(properties.req).to.have.property("remotePort");
    expect(properties).to.have.property("req");
  });

  it("should ensure sensitive data are not being logged on request", async () => {
    await axios.post(`${baseUrl}/req`, { password: "password" });
    const properties = ringbuffer.records[0];
    expect(ringbuffer.records).to.be.length(1);
    expect(properties.req).to.have.property("method");
    expect(properties.req).to.have.property("url");
    expect(properties.req).to.have.property("headers");
    expect(properties.req).to.have.property("remoteAddress");
    expect(properties.req).to.have.property("remotePort");
    expect(properties).to.have.property("req");
    expect(properties.req.body).to.not.have.property("password");
  });

  it("should ensure sensitive data are not being logged on request even if nested", async () => {
    await axios.post(`${baseUrl}/req`, { password: "password", user: { password: "password", other_prop: "other" } });
    const properties = ringbuffer.records[0];
    expect(ringbuffer.records).to.be.length(1);
    expect(properties.req).to.have.property("method");
    expect(properties.req).to.have.property("url");
    expect(properties.req).to.have.property("headers");
    expect(properties.req).to.have.property("remoteAddress");
    expect(properties.req).to.have.property("remotePort");
    expect(properties).to.have.property("req");
    expect(properties.req.body).to.not.have.property("password");
    expect(properties.req.body.user).to.not.have.property("password");
    expect(properties.req.body.user).to.have.property("other_prop");
  });

  it("should ensure non-sensitive data are logged on request", async () => {
    await axios.post(`${baseUrl}/req`, { password: "password", other_prop: "other" });
    const properties = ringbuffer.records[0];
    expect(ringbuffer.records).to.be.length(1);
    expect(properties.req).to.have.property("method");
    expect(properties.req).to.have.property("url");
    expect(properties.req).to.have.property("headers");
    expect(properties.req).to.have.property("remoteAddress");
    expect(properties.req).to.have.property("remotePort");
    expect(properties).to.have.property("req");
    expect(properties.req.body).to.not.have.property("password");
    expect(properties.req.body).to.have.property("other_prop");
  });

  it("should ensure sensitive headers are not logged on request", async () => {
    await axios.post(`${baseUrl}/req`, {}, { headers: { password: "secret", Authorization: "Bearer token", "x-webhook-secret": "whsec_abc" } });
    const properties = ringbuffer.records[0];
    expect(properties.req.headers).to.not.have.property("password");
    expect(properties.req.headers).to.not.have.property("authorization");
    expect(properties.req.headers).to.not.have.property("x-webhook-secret");
    expect(properties.req.headers).to.have.property("content-type");
  });
});

describe("Bunyan#Response", () => {
  it("should be able to log a response", async () => {
    await axios.get(`${baseUrl}/req-res`);
    const properties = ringbuffer.records[0];
    expect(ringbuffer.records).to.be.length(1);
    expect(properties.req).to.have.property("method");
    expect(properties.req).to.have.property("url");
    expect(properties.req).to.have.property("headers");
    expect(properties.req).to.have.property("remoteAddress");
    expect(properties.req).to.have.property("remotePort");
    expect(properties).to.have.property("req");
    expect(properties).to.have.property("res");
  });

  it("should ensure sensitive data are not being logged on response", async () => {
    await axios.post(`${baseUrl}/req-res`, { password: "password" });
    const properties = ringbuffer.records[0];
    expect(ringbuffer.records).to.be.length(1);
    expect(properties.req).to.have.property("method");
    expect(properties.req).to.have.property("url");
    expect(properties.req).to.have.property("headers");
    expect(properties.req).to.have.property("remoteAddress");
    expect(properties.req).to.have.property("remotePort");
    expect(properties).to.have.property("req");
    expect(properties).to.have.property("res");
    expect(properties.req.body).to.not.have.property("password");
  });

  it("should ensure sensitive data are not being logged on response even if nested", async () => {
    await axios.post(`${baseUrl}/req-res`, {
      password: "password",
      user: { password: "password", other_prop: "other" }
    });
    const properties = ringbuffer.records[0];
    expect(ringbuffer.records).to.be.length(1);
    expect(properties.req).to.have.property("method");
    expect(properties.req).to.have.property("url");
    expect(properties.req).to.have.property("headers");
    expect(properties.req).to.have.property("remoteAddress");
    expect(properties.req).to.have.property("remotePort");
    expect(properties).to.have.property("req");
    expect(properties).to.have.property("res");
    expect(properties.req.body).to.not.have.property("password");
    expect(properties.req.body.user).to.not.have.property("password");
    expect(properties.req.body.user).to.have.property("other_prop");
  });

  it("should ensure non-sensitive data are logged on response", async () => {
    await axios.post(`${baseUrl}/req-res`, { password: "password", other_prop: "other" });
    const properties = ringbuffer.records[0];
    expect(ringbuffer.records).to.be.length(1);
    expect(properties.req).to.have.property("method");
    expect(properties.req).to.have.property("url");
    expect(properties.req).to.have.property("headers");
    expect(properties.req).to.have.property("remoteAddress");
    expect(properties.req).to.have.property("remotePort");
    expect(properties).to.have.property("req");
    expect(properties).to.have.property("res");
    expect(properties.req.body).to.not.have.property("password");
    expect(properties.req.body).to.have.property("other_prop");
  });
});

describe("Bunyan#httpError", () => {
  it("should be able to log a http error", async () => {
    await axios.get(`${baseUrl}/error`);
    const properties = ringbuffer.records[0];
    expect(ringbuffer.records).to.be.length(1);
    expect(properties.req).to.have.property("method");
    expect(properties.req).to.have.property("url");
    expect(properties.req).to.have.property("headers");
    expect(properties.req).to.have.property("remoteAddress");
    expect(properties.req).to.have.property("remotePort");
    expect(properties).to.have.property("err");
    expect(properties).to.have.property("req");
    expect(properties).to.have.property("res");
  });
});

describe("Bunyan#DataPayload", () => {
  it("should strip sensitive fields from data logs", () => {
    const dataBuf = new Bunyan.RingBuffer({ limit: 5 });
    const dataLogger = new Logger({
      name: "data_payload_test",
      buffer: dataBuf,
      serializers: defaultSerializers("bvn", "phone_number", "account_number")
    });

    dataLogger.log({ data: { bvn: "12345678901", phone_number: "08012345678", account_number: "0123456789", name: "John Doe" } });

    const record = dataBuf.records[0];
    expect(record.data).to.not.have.property("bvn");
    expect(record.data).to.not.have.property("phone_number");
    expect(record.data).to.not.have.property("account_number");
    expect(record.data).to.have.property("name");
  });
});

describe("Bunyan#warn", () => {
  it("should log a warning with an object", () => {
    logger.warn({ message: "low balance", threshold: 100 });
    const record = ringbuffer.records[0];
    expect(ringbuffer.records).to.be.length(1);
    expect(record).to.have.property("message", "low balance");
    expect(record).to.have.property("threshold", 100);
    expect(record.level).to.equal(40); // Bunyan WARN level
  });

  it("should log a warning with a string message only", () => {
    logger.warn("something looks off");
    const record = ringbuffer.records[0];
    expect(ringbuffer.records).to.be.length(1);
    expect(record.msg).to.equal("something looks off");
    expect(record.level).to.equal(40);
  });

  it("should log a warning with a string message and metadata", () => {
    logger.warn("fallback used", { provider: "faida_v2", reason: "primary timeout" });
    const record = ringbuffer.records[0];
    expect(ringbuffer.records).to.be.length(1);
    expect(record.msg).to.equal("fallback used");
    expect(record).to.have.property("provider", "faida_v2");
    expect(record).to.have.property("reason", "primary timeout");
    expect(record.level).to.equal(40);
  });
});

describe("Bunyan#AxiosRequest", () => {
  it("should strip sensitive headers from axios_req logs", () => {
    const axiosBuf = new Bunyan.RingBuffer({ limit: 5 });
    const axiosLogger = new Logger({
      name: "axios_header_test",
      buffer: axiosBuf,
      serializers: defaultSerializers("Authorization")
    });

    axiosLogger.axiosRequest({
      method: "GET",
      url: "/test",
      headers: { Authorization: "Bearer secret-token", "content-type": "application/json" }
    } as any);

    const record = axiosBuf.records[0];
    expect(record.axios_req.headers).to.not.have.property("Authorization");
    expect(record.axios_req.headers).to.have.property("content-type");
  });
});

describe("Logger#tracing", () => {
  const nullProvider: TracingProvider = {
    getActiveTraceContext() {
      return null;
    }
  };

  const nullTracedLogger = new Logger({
    name: "null_traced_logger",
    buffer: traceBuffer,
    serializers: defaultSerializers(),
    tracing: nullProvider
  });

  describe("log()", () => {
    it("should inject trace_id and span_id on object log", () => {
      tracedLogger.log({ message: "hello" });
      const record = traceBuffer.records[0];
      expect(record).to.have.property("trace_id", "abc123");
      expect(record).to.have.property("span_id", "def456");
      expect(record).to.have.property("message", "hello");
    });

    it("should inject trace context on string log with metadata", () => {
      tracedLogger.log("test message", { extra: "data" });
      const record = traceBuffer.records[0];
      expect(record).to.have.property("trace_id", "abc123");
      expect(record).to.have.property("span_id", "def456");
      expect(record).to.have.property("extra", "data");
    });

    it("should inject trace context on string-only log", () => {
      tracedLogger.log("just a string");
      const record = traceBuffer.records[0];
      expect(record).to.have.property("trace_id", "abc123");
      expect(record).to.have.property("span_id", "def456");
    });
  });

  describe("warn()", () => {
    it("should inject trace_id and span_id on object warn", () => {
      tracedLogger.warn({ message: "degraded" });
      const record = traceBuffer.records[0];
      expect(record).to.have.property("trace_id", "abc123");
      expect(record).to.have.property("span_id", "def456");
      expect(record).to.have.property("message", "degraded");
    });

    it("should inject trace context on string warn with metadata", () => {
      tracedLogger.warn("fallback triggered", { service: "faida_v2" });
      const record = traceBuffer.records[0];
      expect(record).to.have.property("trace_id", "abc123");
      expect(record).to.have.property("span_id", "def456");
      expect(record).to.have.property("service", "faida_v2");
    });

    it("should inject trace context on string-only warn", () => {
      tracedLogger.warn("cache miss");
      const record = traceBuffer.records[0];
      expect(record).to.have.property("trace_id", "abc123");
      expect(record).to.have.property("span_id", "def456");
    });
  });

  describe("error()", () => {
    it("should inject trace context on error with no extras", () => {
      tracedLogger.error(new Error("boom"));
      const record = traceBuffer.records[0];
      expect(record).to.have.property("trace_id", "abc123");
      expect(record).to.have.property("span_id", "def456");
      expect(record).to.have.property("err");
    });

    it("should inject trace context on error with string message", () => {
      tracedLogger.error(new Error("boom"), "custom message");
      const record = traceBuffer.records[0];
      expect(record).to.have.property("trace_id", "abc123");
      expect(record).to.have.property("span_id", "def456");
      expect(record).to.have.property("err");
    });

    it("should inject trace context on error with object extras", () => {
      tracedLogger.error(new Error("boom"), { request_id: "req-1" });
      const record = traceBuffer.records[0];
      expect(record).to.have.property("trace_id", "abc123");
      expect(record).to.have.property("span_id", "def456");
      expect(record).to.have.property("err");
      expect(record).to.have.property("request_id", "req-1");
    });
  });

  describe("request()", () => {
    it("should inject trace context on HTTP request log", async () => {
      await axios.get(`${tracedBaseUrl}/req`);
      const record = traceBuffer.records[0];
      expect(record).to.have.property("trace_id", "abc123");
      expect(record).to.have.property("span_id", "def456");
      expect(record).to.have.property("req");
    });
  });

  describe("response()", () => {
    it("should inject trace context on HTTP response log", async () => {
      await axios.get(`${tracedBaseUrl}/req-res`);
      const record = traceBuffer.records[0];
      expect(record).to.have.property("trace_id", "abc123");
      expect(record).to.have.property("span_id", "def456");
      expect(record).to.have.property("req");
      expect(record).to.have.property("res");
    });
  });

  describe("httpError()", () => {
    it("should inject trace context on HTTP error log", async () => {
      await axios.get(`${tracedBaseUrl}/error`);
      const record = traceBuffer.records[0];
      expect(record).to.have.property("trace_id", "abc123");
      expect(record).to.have.property("span_id", "def456");
      expect(record).to.have.property("err");
      expect(record).to.have.property("req");
      expect(record).to.have.property("res");
    });
  });

  describe("axiosRequest()", () => {
    it("should inject trace context on axios request log", () => {
      tracedLogger.axiosRequest({ method: "GET", url: "/test" } as any);
      const record = traceBuffer.records[0];
      expect(record).to.have.property("trace_id", "abc123");
      expect(record).to.have.property("span_id", "def456");
      expect(record).to.have.property("axios_req");
    });
  });

  describe("axiosResponse()", () => {
    it("should inject trace context on axios response log", () => {
      tracedLogger.axiosResponse({
        status: 200,
        statusText: "OK",
        headers: {},
        config: { method: "GET", url: "/test" },
        data: { ok: true }
      } as any);
      const record = traceBuffer.records[0];
      expect(record).to.have.property("trace_id", "abc123");
      expect(record).to.have.property("span_id", "def456");
      expect(record).to.have.property("axios_req");
      expect(record).to.have.property("axios_res");
    });
  });

  describe("axiosError()", () => {
    it("should inject trace context on axios error log", () => {
      const err = new AxiosError("fail", "ERR_BAD_REQUEST", {} as any);
      err.response = {
        status: 400,
        statusText: "Bad Request",
        headers: {},
        config: { method: "POST", url: "/fail" },
        data: { error: "bad" }
      } as any;
      tracedLogger.axiosError(err);
      const record = traceBuffer.records[0];
      expect(record).to.have.property("trace_id", "abc123");
      expect(record).to.have.property("span_id", "def456");
      expect(record).to.have.property("axios_req");
      expect(record).to.have.property("axios_res");
    });
  });

  describe("null/no provider", () => {
    it("should not inject trace fields when provider returns null", () => {
      nullTracedLogger.log({ message: "no trace" });
      const record = traceBuffer.records[0];
      expect(record).to.not.have.property("trace_id");
      expect(record).to.not.have.property("span_id");
      expect(record).to.have.property("message", "no trace");
    });

    it("should not inject trace fields when no provider is configured", () => {
      const plainLogger = new Logger({
        name: "plain",
        buffer: traceBuffer,
        serializers: defaultSerializers()
      });
      plainLogger.log({ message: "plain" });
      const record = traceBuffer.records[0];
      expect(record).to.not.have.property("trace_id");
      expect(record).to.not.have.property("span_id");
    });
  });

  describe("child()", () => {
    it("should propagate tracing through child logger", () => {
      const child = tracedLogger.child({ component: "test" });
      child.log({ message: "from child" });
      const record = traceBuffer.records[0];
      expect(record).to.have.property("trace_id", "abc123");
      expect(record).to.have.property("span_id", "def456");
      expect(record).to.have.property("component", "test");
      expect(record).to.have.property("message", "from child");
    });

    it("should not inject trace fields on child of untraced logger", () => {
      const child = nullTracedLogger.child({ component: "test" });
      child.log({ message: "from child" });
      const record = traceBuffer.records[0];
      expect(record).to.not.have.property("trace_id");
      expect(record).to.not.have.property("span_id");
      expect(record).to.have.property("component", "test");
    });
  });
});
