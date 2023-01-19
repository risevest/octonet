import { Server } from "http";

import { faker } from "@faker-js/faker";
import { AxiosHeaders } from "axios";
import { RingBuffer } from "bunyan";
import { expect } from "chai";

import { HttpAgent, HttpMethod } from "../../src/http/agent";
import { Logger } from "../../src/logging/logger";
import { defaultSerializers } from "../../src/logging/serializers";
import { randomString } from "../helpers";
import { TestRequest, createTestApp, startServer, stopServer } from "./server";

let server: Server;
let mockResourceURL: string;
let port: number;

beforeAll(async () => {
  const app = createTestApp();
  [server, port] = await startServer(app);
  mockResourceURL = `http://localhost:${port}/test`;
});

afterAll(async () => {
  await stopServer(server);
});

describe("HttpAgent#makeRequest", () => {
  const agent = new HttpAgent({ service: "test_service", secret: randomString(32), scheme: "Test" });

  it("should properly set params for DELETE requests", async () => {
    const data = { first_name: faker.name.firstName(), last_name: faker.name.lastName() };
    const req = agent.makeRequest(HttpMethod.DELETE, mockResourceURL, data);
    const res = await req.do<TestRequest>();

    expect(res.method.toUpperCase()).to.be.eq(HttpMethod.DELETE);
    expect(res.query).to.be.eql(data);
    expect(res.body).to.be.undefined;
  });

  it("should properly set params for GET requests", async () => {
    const data = { first_name: faker.name.firstName(), last_name: faker.name.lastName() };
    const req = agent.makeRequest(HttpMethod.GET, mockResourceURL, data);
    const res = await req.do<TestRequest>();

    expect(res.method.toUpperCase()).to.be.eq(HttpMethod.GET);
    expect(res.query).to.be.eql(data);
    expect(res.body).to.be.undefined;
  });

  it("should create a basic request", async () => {
    const data = { first_name: faker.name.firstName(), last_name: faker.name.lastName() };
    const req = agent.makeRequest(HttpMethod.POST, mockResourceURL, data);
    const res = await req.do<TestRequest>();

    expect(res.method.toUpperCase()).to.be.eq(HttpMethod.POST);
    expect(res.body).to.be.eql(data);
  });
});

describe("HttpAgent#useLogger", () => {
  const ringbuffer = new RingBuffer({ limit: 5 });
  const logger = new Logger({
    name: "logger_tests",
    buffer: ringbuffer,
    serializers: defaultSerializers("hidden", "body.hidden")
  });
  const agent = new HttpAgent({ service: "test_service", secret: randomString(32), scheme: "Test", logger });

  afterEach(() => {
    ringbuffer.records = [];
  });

  it("should log axios requests and responses", async () => {
    const data = { first_name: faker.name.firstName(), last_name: faker.name.lastName() };
    await agent.makeRequest(HttpMethod.POST, mockResourceURL, { ...data, hidden: true }).do<TestRequest>();

    expect(ringbuffer.records).to.have.length(2);

    const [requestLog, responseLog] = ringbuffer.records;

    expect(requestLog.axios_req.method.toUpperCase()).to.be.eq(HttpMethod.POST);
    expect(requestLog.axios_req.url).to.be.eq(mockResourceURL);
    expect(requestLog.axios_req.headers).to.be.a("object");
    expect(requestLog.axios_req.data).to.deep.equal(data);

    expect(responseLog.axios_res.body.body).to.deep.equal(data);
    expect(responseLog.axios_res.statusCode).to.be.eq(200);
    expect(responseLog.axios_res.headers).to.be.instanceOf(AxiosHeaders);
    expect(responseLog.axios_res.body.method).to.be.eq(HttpMethod.POST);
  });

  it("should log errors", async () => {
    try {
      await agent.makeRequest(HttpMethod.GET, `${mockResourceURL}/error`).do<TestRequest>();
    } catch (err) {
      // discard error
    }

    expect(ringbuffer.records).to.have.length(2);
    const [, responseLog] = ringbuffer.records;
    expect(responseLog.axios_req).to.be.a("object");
    expect(responseLog.axios_res).to.be.a("object");
  });
});
