import { Logger, defaultSerializers, createRequestSerializer } from "../../src/logging";
import Bunyan, { INFO } from "bunyan";
import { expect } from "chai";
import axios from "axios";
import app from "./server";
import http from "http";

const ringbuffer = new Bunyan.RingBuffer({ limit: 100 });

export const logger = new Logger({
  name: "logger_tests",
  streams: [
    {
      stream: ringbuffer
    }
  ],
  serializers: defaultSerializers(
    {
      http_req: createRequestSerializer("admin.password")
    },
    "password"
  )
});

const baseUrl = "http://localhost:3005";

before(() => {
  http.createServer(app).listen(3005);
});

// clears the buffer after each test
afterEach(() => {
  ringbuffer.records = [];
});

describe("Bunyan#Request", () => {
  it("should be able to log a request", async () => {
    await axios.get(`${baseUrl}/req`);

    const properties = JSON.parse(ringbuffer.records);

    expect(ringbuffer.records).to.be.length(1);
    expect(properties.req).to.have.property("method");
    expect(properties.req).to.have.property("url");
    expect(properties.req).to.have.property("headers");
    expect(properties.req).to.have.property("remoteAddress");
    expect(properties.req).to.have.property("remotePort");
    expect(properties).to.have.property("req");
  });
});

describe("Bunyan#Response", () => {
  it("should be able to log a response", async () => {
    await axios.get(`${baseUrl}/req-res`);

    const properties = JSON.parse(ringbuffer.records);

    expect(ringbuffer.records).to.be.length(1);
    expect(properties.req).to.have.property("method");
    expect(properties.req).to.have.property("url");
    expect(properties.req).to.have.property("headers");
    expect(properties.req).to.have.property("remoteAddress");
    expect(properties.req).to.have.property("remotePort");
    expect(properties).to.have.property("req");
    expect(properties).to.have.property("res");
  });
});

describe("Bunyan#httpError", () => {
  it("should be able to log a http error", async () => {
    await axios.get(`${baseUrl}/error`);

    const properties = JSON.parse(ringbuffer.records);

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
