import { Server } from "http";

import axios from "axios";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import faker from "faker";
import { before } from "mocha";
import { v4 } from "uuid";

import { HttpMethod } from "../../src/http/agent";
import { APIError, NoAuthorizationTokenError, NoRequestIDError, TimeoutError } from "../../src/http/errors";
import * as jwt from "../../src/http/jwt";
import { RequestWrapper } from "../../src/http/wrapper";
import { randomString } from "../helpers";
import { createTestApp, startServer, stopServer } from "./server";

chai.use(chaiAsPromised);

let server: Server;
let mockResourceURL: string;
let port: number;

const axiosInstance = axios.create();
const service = "test_service";
const secret = new TextEncoder().encode(randomString(32));
const scheme = "Test";
const authConfig = {
  secret,
  scheme,
  timeout: "10s"
};
const requestIDHeader = "x-request-id";
const originServiceHeader = "x-origin-service";

before(async () => {
  const app = createTestApp();
  [server, port] = await startServer(app);
  mockResourceURL = `http://localhost:${port}/test`;
});

after(async () => {
  await stopServer(server);
});

describe("RequestWrapper#type", () => {
  it("should set content type to JSON", async () => {
    const data = { first_name: faker.name.firstName(), last_name: faker.name.lastName() };
    const request = { method: HttpMethod.POST, url: mockResourceURL, data };
    const req = new RequestWrapper(axiosInstance, service, authConfig, request);

    const res = await req.type("json").do();

    expect(res.headers["content-type"]).to.be.eq("application/json");
    expect(res.body).to.be.eql(data);
  });

  it("should set content type to URL encoded format", async () => {
    const data = { first_name: faker.name.firstName(), last_name: faker.name.lastName() };
    const request = { method: HttpMethod.POST, url: mockResourceURL, data };
    const req = new RequestWrapper(axiosInstance, service, authConfig, request);

    const res = await req.type("urlencoded").do();

    expect(res.headers["content-type"]).to.be.eq("application/x-www-form-urlencoded");
    expect(res.body).to.be.eql(data);
  });

  it("should set content type to multipart", async () => {
    const data = { first_name: faker.name.firstName(), last_name: faker.name.lastName() };
    const request = { method: HttpMethod.POST, url: mockResourceURL, data };
    const req = new RequestWrapper(axiosInstance, service, authConfig, request);

    const res = await req.type("form").do();

    expect(res.headers["content-type"]).to.contain("multipart/form-data");
    expect(res.body).to.be.eql(data);
  });
});

describe("RequestWrapper#set", () => {
  it("should set a header", async () => {
    const request = { method: HttpMethod.GET, url: mockResourceURL };
    const req = new RequestWrapper(axiosInstance, service, authConfig, request);
    const header = faker.lorem.word();

    const res = await req.set("X-Custom-Header", header).do();

    expect(res.headers["x-custom-header"]).to.be.eq(header);
  });

  it("should set multiple headers", async () => {
    const request = { method: HttpMethod.GET, url: mockResourceURL };
    const req = new RequestWrapper(axiosInstance, service, authConfig, request);
    const header = faker.lorem.word();
    const header2 = faker.lorem.word();

    const res = await req
      .set({
        "X-Custom-Header-1": header,
        "X-Custom-Header-2": header2
      })
      .do();

    expect(res.headers["x-custom-header-1"]).to.be.eq(header);
    expect(res.headers["x-custom-header-2"]).to.be.eq(header2);
  });
});

describe("RequestWrapper#track", () => {
  it("should track requests with no source request", async () => {
    const request = { method: HttpMethod.GET, url: mockResourceURL };
    const req = new RequestWrapper(axiosInstance, service, authConfig, request);

    const res = await req.track().do();

    expect(res.headers[requestIDHeader]).to.be.a("string");
    expect(res.headers[originServiceHeader]).to.be.eq(service);
  });

  it("should fail when request ID is not set on source request", async () => {
    const request = { method: HttpMethod.GET, url: mockResourceURL };
    const req = new RequestWrapper(axiosInstance, service, authConfig, request);
    const sourceReq: any = { headers: {} };

    const makeRequest = () => req.track(sourceReq);
    expect(makeRequest).to.throw(NoRequestIDError);
  });

  it("should transfer request ID", async () => {
    const request = { method: HttpMethod.GET, url: mockResourceURL };
    const req = new RequestWrapper(axiosInstance, service, authConfig, request);
    const sourceReq: any = { headers: { [requestIDHeader]: v4() } };

    const res = await req.track(sourceReq).do();

    expect(res.headers[requestIDHeader]).to.be.eq(sourceReq.headers[requestIDHeader]);
    expect(res.headers[originServiceHeader]).to.be.eq(service);
  });
});

describe("RequestWrapper#auth", () => {
  it("should reject unauthenticated requests", async () => {
    const request = { method: HttpMethod.GET, url: mockResourceURL };
    const req = new RequestWrapper(axiosInstance, service, authConfig, request);
    const sourceReq: any = { headers: {} };

    const makeRequest = () => req.auth(sourceReq);
    expect(makeRequest).to.throw(NoAuthorizationTokenError);
  });

  it("should transfer authorization", async () => {
    const request = { method: HttpMethod.GET, url: mockResourceURL };
    const req = new RequestWrapper(axiosInstance, service, authConfig, request);
    const sourceReq: any = { headers: { authorization: `Bearer ${randomString(32)}` } };

    const res = await req.auth(sourceReq).do();

    expect(res.headers.authorization).to.be.eq(sourceReq.headers.authorization);
  });

  it("should create a token from the session", async () => {
    const request = { method: HttpMethod.GET, url: mockResourceURL };
    const req = new RequestWrapper(axiosInstance, service, authConfig, request);
    const data = { first_name: faker.name.firstName(), last_name: faker.name.lastName() };

    const res = await req.auth(data).do();

    expect(res.headers.authorization).to.match(/Test\s.+/);

    const [, token] = res.headers.authorization.split(" ");
    const session = await jwt.decode(secret, token);

    expect(session).to.be.eql(data);
  });

  it("should create a default session when none is passed", async () => {
    const request = { method: HttpMethod.GET, url: mockResourceURL };
    const req = new RequestWrapper(axiosInstance, service, authConfig, request);

    const res = await req.auth().do();

    expect(res.headers.authorization).to.match(/Test\s.+/);

    const [, token] = res.headers.authorization.split(" ");
    const session = await jwt.decode(secret, token);

    expect(session.service).to.be.eq(service);
    expect(Date.parse(session.request_time)).to.not.be.NaN;
  });
});

describe("RequestWrapper#do", () => {
  it("run a basic request", async () => {
    const request = { method: HttpMethod.GET, url: mockResourceURL };
    const req = new RequestWrapper(axiosInstance, service, authConfig, request);
    const res = await req.do();

    expect(res.method).to.be.eq(HttpMethod.GET);
  });

  it("cause a timeout with 500ms timeout", async function () {
    this.timeout(1500);

    const request = { method: HttpMethod.GET, url: `${mockResourceURL}/timeout` };
    const req = new RequestWrapper(axiosInstance, service, authConfig, request);

    await expect(req.do(0.5)).rejectedWith(TimeoutError);
  });

  it("not cause a timeout with 5s timeout", async function () {
    this.timeout(1500);

    const request = { method: HttpMethod.GET, url: `${mockResourceURL}/timeout` };
    const req = new RequestWrapper(axiosInstance, service, authConfig, request);

    await expect(req.do(5)).fulfilled;
  });

  it("handles API errors", async function () {
    const request = { method: HttpMethod.GET, url: `${mockResourceURL}/error` };
    const req = new RequestWrapper(axiosInstance, service, authConfig, request);
    const promise = req.do();

    await expect(promise).rejectedWith(APIError);

    let err: APIError;
    try {
      await promise;
    } catch (error) {
      err = error;
    }

    expect(err.status).to.be.eq(422);
    expect(err.data).to.haveOwnProperty("message");
    expect(err.data.message).to.be.eq("an error occurred");
  });
});
