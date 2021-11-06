import { expect } from "chai";
import crypto from "crypto";
import faker from "faker";
import { Server } from "http";
import { before } from "mocha";
import { v4 } from "uuid";
import { HttpMethod, NoAuthorizationTokenError, NoRequestIDError, ServiceClient } from "../../src";
import { createTestApp, startServer, stopServer } from "./server";

let server: Server;
let mockResourceURL: string;
let port: number;

const service = "test_service";
const httpClient = new ServiceClient(service);
const requestIDHeader = "x-request-id";

before(async () => {
  const app = createTestApp();
  [server, port] = await startServer(app);
  mockResourceURL = `http://localhost:${port}/test`;
});

after(async () => {
  await stopServer(server);
});

describe("ServiceClient#makeRequest", () => {
  it("should handle no request id errors", () => {
    const mockRequest: any = {
      headers: {
        authorization: crypto.createHmac("sha256", "secret").update("key").digest("hex")
      }
    };
    const data = {};
    const makeRequest = () => httpClient.makeRequest(mockRequest, HttpMethod.GET, mockResourceURL, data);
    expect(makeRequest).to.throw(NoRequestIDError);
  });

  it("should handle no authorization token errors", () => {
    const data = {};
    const mockRequest: any = { headers: { [requestIDHeader]: v4() } };
    const makeRequest = () => httpClient.makeRequest(mockRequest, HttpMethod.GET, mockResourceURL, data);
    expect(makeRequest).to.throw(NoAuthorizationTokenError);
  });

  it("should set params instead for get requests", () => {
    const params = { first_name: faker.name.firstName() };
    const mockRequest: any = {
      headers: {
        [requestIDHeader]: v4(),
        authorization: crypto.createHmac("sha256", "secret").update("key").digest("hex")
      }
    };
    const req = httpClient.makeRequest(mockRequest, HttpMethod.GET, mockResourceURL, params);

    expect(req.method).to.be.eq(HttpMethod.GET);
    expect(req.params).to.be.eql(params);
  });

  it("should set params instead for delete requests", () => {
    const params = { first_name: faker.name.firstName() };
    const mockRequest: any = {
      headers: {
        [requestIDHeader]: v4(),
        authorization: crypto.createHmac("sha256", "secret").update("key").digest("hex")
      }
    };
    const req = httpClient.makeRequest(mockRequest, HttpMethod.DELETE, mockResourceURL, params);

    expect(req.method).to.be.eq(HttpMethod.DELETE);
    expect(req.params).to.be.eql(params);
  });

  it("should maka a request", () => {
    const data = { first_name: faker.name.firstName() };
    const mockRequest: any = {
      headers: {
        [requestIDHeader]: v4(),
        authorization: crypto.createHmac("sha256", "secret").update("key").digest("hex")
      }
    };
    const req = httpClient.makeRequest(mockRequest, HttpMethod.POST, mockResourceURL, data);

    expect(req.url).to.be.eq(mockResourceURL);
    expect(req.method).to.be.eq(HttpMethod.POST);
    expect(req.data).to.be.eql(data);
    expect(req.headers["X-Request-ID"]).to.be.a("string");
    expect(req.headers["X-Origin-Service"]).to.be.eq(service);
  });
});
