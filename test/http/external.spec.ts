import { RingBuffer } from "bunyan";
import { expect } from "chai";
import faker from "faker";
import { Server } from "http";
import { defaultSerializers, ExternalClient, HttpMethod, Logger } from "../../src";
import { createTestApp, startServer, stopServer, TestRequest } from "./server";

const ringbuffer = new RingBuffer({ limit: 5 });
const logger = new Logger({
  name: "logger_tests",
  buffer: ringbuffer,
  serializers: defaultSerializers()
});
const httpClient = new ExternalClient(logger);
let server: Server;
let port: number;
let mockResourceURL: string;

before(async () => {
  const app = createTestApp();
  [server, port] = await startServer(app);
  mockResourceURL = `http://localhost:${port}/test`;
});

after(async () => {
  await stopServer(server);
});

afterEach(() => {
  ringbuffer.records = [];
});

describe("ExternalClient#makeRequest", () => {
  it("should make a request config with ID and origin service", async () => {
    const data = { first_name: faker.name.firstName() };
    const req = httpClient.makeRequest(HttpMethod.POST, mockResourceURL, data);

    expect(req.url).to.be.eq(mockResourceURL);
    expect(req.method).to.be.eq(HttpMethod.POST);
    expect(req.data).to.be.eql(data);
  });

  it("should set params instead for get requests", async () => {
    const params = { first_name: faker.name.firstName() };
    const req = httpClient.makeRequest(HttpMethod.GET, mockResourceURL, params);

    expect(req.method).to.be.eq(HttpMethod.GET);
    expect(req.params).to.be.eql(params);
  });

  it("should set params instead for delete requests", async () => {
    const params = { first_name: faker.name.firstName() };
    const req = httpClient.makeRequest(HttpMethod.DELETE, mockResourceURL, params);

    expect(req.method).to.be.eq(HttpMethod.DELETE);
    expect(req.params).to.be.eql(params);
  });
});

describe("ExternalClient#doRequest", () => {
  it("should log axios requests and responses", async () => {
    const header = { Authorization: `Bearer ${faker.random.alphaNumeric(32)}` };
    const body = { first_name: faker.name.firstName(), last_name: faker.name.lastName() };
    await httpClient.do<TestRequest>({
      method: HttpMethod.POST,
      url: mockResourceURL,
      data: body,
      headers: header
    });

    expect(ringbuffer.records).to.be.length(2);

    const [requestLog, responseLog] = ringbuffer.records;

    expect(requestLog.axios_req.method).to.be.eq(HttpMethod.POST.toLowerCase());
    expect(requestLog.axios_req.url).to.be.eq(mockResourceURL);
    expect(requestLog.axios_req.headers).to.deep.includes(header);
    expect(requestLog.axios_req.data).to.be.eql(body);

    expect(responseLog.axios_req.data).to.be.eql(body);
    expect(responseLog.axios_res.statusCode).to.be.eq(200);
    expect(responseLog.axios_res.headers).to.be.a("object");
    expect(responseLog.axios_res.body.method).to.be.eq(HttpMethod.POST);
  });

  it("should log errors", async () => {
    const header = { Authorization: `Bearer ${faker.random.alphaNumeric(32)}` };
    const body = { first_name: faker.name.firstName(), last_name: faker.name.lastName() };
    try {
      await httpClient.do<TestRequest>({
        method: HttpMethod.POST,
        url: `${mockResourceURL}/error`,
        data: body,
        headers: header
      });
    } catch (err) {
      // discard error
    }

    expect(ringbuffer.records).to.be.length(2);

    const [, responseLog] = ringbuffer.records;
    expect(responseLog.axios_req).to.be.a("object");
    expect(responseLog.axios_res).to.be.a("object");
  });
});
