import axios from "axios";
import Bunyan from "bunyan";
import { expect } from "chai";
import http from "http";
import { defaultSerializers, Logger } from "../../src";
import app from "./server";
const ringbuffer = new Bunyan.RingBuffer({ limit: 5 });
export const logger = new Logger({
  name: "logger_tests",
  buffer: ringbuffer,
  serializers: defaultSerializers("admin.password", "password")
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
    const properties = ringbuffer.records[0];
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