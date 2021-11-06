import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import faker from "faker";
import { Server } from "http";
import { before } from "mocha";
import { BaseClient } from "../../src";
import { HttpMethod } from "../../src/http/client";
import { createTestApp, startServer, stopServer } from "./server";

chai.use(chaiAsPromised);

const service = "test_service";
const httpClient = new BaseClient(service);
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

describe("BaseClient#makeRequest", () => {
  it("should make a request config with ID and origin service", async () => {
    const data = { first_name: faker.name.firstName() };
    const req = httpClient.makeRequest(HttpMethod.POST, mockResourceURL, data);

    expect(req.url).to.be.eq(mockResourceURL);
    expect(req.method).to.be.eq(HttpMethod.POST);
    expect(req.data).to.be.eql(data);

    expect(req.headers["X-Request-ID"]).to.be.a("string");
    expect(req.headers["X-Origin-Service"]).to.be.eq(service);
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
