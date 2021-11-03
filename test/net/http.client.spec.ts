import { startServer, stopServer, TestResponse } from "../server";
import { APIError, HttpError } from "../../src/net/errors";
import { Server } from "http";
import { InternetService } from "../../src/net/internet";
import { expect } from "chai";
import { Logger, defaultSerializers, createRequestSerializer } from "../../src/logging";
import Bunyan from "bunyan";

let server: Server;

before(async () => {
  server = (await startServer(3006)) as Server;
});

after(async () => {
  await stopServer(server);
});

afterEach(() => {
  ringbuffer.records = [];
});

const ringbuffer = new Bunyan.RingBuffer({ limit: 5 });

const logger = new Logger({
  name: "logger_tests",
  buffer: ringbuffer,
  serializers: defaultSerializers({ http_req: createRequestSerializer("admin.password") }, "password")
});

const httpClient = new InternetService(200, logger);
const mockServerUrl = `http://localhost:${3006}`;
const body = { foo: "bar" };

describe("HttpClient#Get", () => {
  it("should throw error if URL isn't found", async () => {
    const url = `${mockServerUrl}/test/not-found`;
    let changed = false;
    try {
      await httpClient.get(url, {});
      changed = true;
    } catch (err) {
      expect(err).to.be.instanceOf(APIError);
    }
    expect(changed).to.be.equal(false);
    expect(ringbuffer.records).to.be.length(2);
  });

  it("should throw error if remote server isn't found", async () => {
    const url = `http://localhost:40410/test`;
    let changed = false;
    try {
      await httpClient.get(url, {});
    } catch (err) {
      expect(err).to.be.instanceOf(HttpError);
    }
    expect(changed).to.be.equal(false);
    expect(ringbuffer.records).to.be.length(2);
  });

  it("should return a response of type T if all is provided", async () => {
    const url = `${mockServerUrl}/test`;
    const res = await httpClient.get<TestResponse>(url, {});

    expect(res).to.haveOwnProperty("data");
    expect(res).to.haveOwnProperty("error");
    expect(ringbuffer.records).to.be.length(2);
  });

  it("should return a response of type T when a header is required", async () => {
    const url = `${mockServerUrl}/auth`;
    const res = await httpClient.get<TestResponse>(url, { authorization: "Bearer" });

    expect(res).to.haveOwnProperty("data");
    expect(res).to.haveOwnProperty("error");
    expect(ringbuffer.records).to.be.length(2);
  });
});

describe("HttpClient#post", () => {
  it("should return a response of type T if all is provided", async () => {
    const url = `${mockServerUrl}/test`;
    const res = await httpClient.post<TestResponse>(url, body);

    expect(res).to.haveOwnProperty("data");
    expect(res).to.haveOwnProperty("error");
    expect(ringbuffer.records).to.be.length(2);
  });
});

describe("Baselient#put", () => {
  it("should return a response of type T if all is provided", async () => {
    const url = `${mockServerUrl}/test/som_random_id`;
    const res = await httpClient.put<TestResponse>(url, body);

    expect(res).to.haveOwnProperty("data");
    expect(res).to.haveOwnProperty("error");
    expect(ringbuffer.records).to.be.length(2);
  });
});

describe("HttpClient#patch", () => {
  it("should return a response of type T if all is provided", async () => {
    const url = `${mockServerUrl}/test/som_random_id`;
    const res = await httpClient.patch<TestResponse>(url, body);

    expect(res).to.haveOwnProperty("data");
    expect(res).to.haveOwnProperty("error");
    expect(ringbuffer.records).to.be.length(2);
  });
});

describe("HttpClient#delete", () => {
  it("should return a response of type T if all is provided", async () => {
    const url = `${mockServerUrl}/test/som_random_id`;
    const res = await httpClient.del<TestResponse>(url, body);

    expect(res).to.haveOwnProperty("data");
    expect(res).to.haveOwnProperty("error");
    expect(ringbuffer.records).to.be.length(2);
  });
});
