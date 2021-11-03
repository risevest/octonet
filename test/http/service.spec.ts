import { expect } from "chai";
import { before } from "mocha";
import { v4 } from "uuid";
import crypto from "crypto";
import { ServiceClient } from "../../src";
import { APIError, HttpError, NoRequestIDError } from "../../src/http/errors";
import { NoAuthorizationTokenError } from "../../src/http/errors";
import { startServer, stopServer, TestResponse } from "./server";
import { Server } from "http";

let httpClient: ServiceClient;
let server: Server;
let mockServerUrl: string;

const body = { foo: 'bar' };
const service = 'test_service';
const requestId = { "x-request-id": v4() }
const authorization = { authorization: crypto.createHmac("sha256", 'secret').update('key').digest("hex") }


before(async () => {
  server = await startServer(4040) as Server;
  mockServerUrl = `http://localhost:${4040}`;
})

after(async () => {
  await stopServer(server);
})


beforeEach(() => {
  httpClient = new ServiceClient(service);
})

describe("ServiceClient#get", () => {
  it("should throw error if request id isn't provided", async () => {
    const url = `${mockServerUrl}/test`;
    const req: any = {};
    expect(httpClient.get.bind(httpClient, req, url, body)).to.throw(NoRequestIDError);
  })

  it("should throw error if auth token isn't provided", async () => {
    const url = `${mockServerUrl}/test`;
    const req: any = { ...requestId, headers: {} };
    expect(httpClient.get.bind(httpClient, req, url, body)).to.throw(NoAuthorizationTokenError);
  })

  it("should throw error if URL isn't found", async () => {
    const url = `${mockServerUrl}/test/not-found`;
    const req: any = { ...requestId, headers: { ...authorization } };
    let changed = false;
    try {
      await httpClient.get(req, url, body)
      changed = true;
    } catch (err) {
      expect(err).to.be.instanceOf(APIError);
    }
    expect(changed).to.be.equal(false);
  })

  it("should throw error if remote server isn't found", async () => {
    const url = `http://localhost:40410/test`;
    const req: any = { ...requestId, headers: { ...authorization } };
    let changed = false;
    try {
      await httpClient.get(req, url, body)
    } catch (err) {
      expect(err).to.be.instanceOf(HttpError);
    }
    expect(changed).to.be.equal(false);
  })

  it("should return a response of type T if all is provided", async () => {
    const url = `${mockServerUrl}/test`;
    const req: any = { ...requestId, headers: { ...authorization } };
    const res = await httpClient.get<TestResponse>(req, url, body, body);
    expect(res).to.haveOwnProperty('data');
    expect(res).to.haveOwnProperty('error');
  })
})


describe("ServiceClient#post", () => {
  it("should throw error if request id isn't provided", async () => {
    const url = `${mockServerUrl}/test`;
    const req: any = {};
    expect(httpClient.post.bind(httpClient, req, url, body)).to.throw(NoRequestIDError);
  })

  it("should throw error if auth token isn't provided", async () => {
    const url = `${mockServerUrl}/test`;
    const req: any = { ...requestId, headers: {} };
    expect(httpClient.post.bind(httpClient, req, url, body)).to.throw(NoAuthorizationTokenError);
  })

  it("should return a response of type T if all is provided", async () => {
    const url = `${mockServerUrl}/test`;
    const req: any = { ...requestId, headers: { ...authorization } };
    const res = await httpClient.post<TestResponse>(req, url, body);
    expect(res).to.haveOwnProperty('data');
    expect(res).to.haveOwnProperty('error');
  })
})

describe("ServiceClient#put", () => {
  it("should throw error if request id isn't provided", async () => {
    const url = `${mockServerUrl}/test/som_random_id`;
    const req: any = {};
    expect(httpClient.put.bind(httpClient, req, url, body)).to.throw(NoRequestIDError);
  })

  it("should throw error if auth token isn't provided", async () => {
    const url = `${mockServerUrl}/test/som_random_id`;
    const req: any = { ...requestId, headers: {} };
    expect(httpClient.put.bind(httpClient, req, url, body)).to.throw(NoAuthorizationTokenError);
  })

  it("should return a response of type T if all is provided", async () => {
    const url = `${mockServerUrl}/test/som_random_id`;
    const req: any = { ...requestId, headers: { ...authorization } };
    const res = await httpClient.put<TestResponse>(req, url, body);
    expect(res).to.haveOwnProperty('data');
    expect(res).to.haveOwnProperty('error');
  })
})

describe("ServiceClient#patch", () => {
  it("should throw error if request id isn't provided", async () => {
    const url = `${mockServerUrl}/test/som_random_id`;
    const req: any = {};
    expect(httpClient.patch.bind(httpClient, req, url, body)).to.throw(NoRequestIDError);
  })

  it("should throw error if auth token isn't provided", async () => {
    const url = `${mockServerUrl}/test/som_random_id`;
    const req: any = { ...requestId, headers: {} };
    expect(httpClient.patch.bind(httpClient, req, url, body)).to.throw(NoAuthorizationTokenError);
  })

  it("should return a response of type T if all is provided", async () => {
    const url = `${mockServerUrl}/test/som_random_id`;
    const req: any = { ...requestId, headers: { ...authorization } };
    const res = await httpClient.patch<TestResponse>(req, url, body);
    expect(res).to.haveOwnProperty('data');
    expect(res).to.haveOwnProperty('error');
  })
})

describe("ServiceClient#delete", () => {
  it("should throw error if request id isn't provided", async () => {
    const url = `${mockServerUrl}/test/som_random_id`;
    const req: any = {};
    expect(httpClient.del.bind(httpClient, req, url, body)).to.throw(NoRequestIDError);
  })

  it("should throw error if auth token isn't provided", async () => {
    const url = `${mockServerUrl}/test/som_random_id`;
    const req: any = { ...requestId, headers: {} };
    expect(httpClient.del.bind(httpClient, req, url, body)).to.throw(NoAuthorizationTokenError);
  })

  it("should return a response of type T if all is provided", async () => {
    const url = `${mockServerUrl}/test/som_random_id`;
    const req: any = { ...requestId, headers: { ...authorization } };
    const res = await httpClient.del<TestResponse>(req, url, body);
    expect(res).to.haveOwnProperty('data');
    expect(res).to.haveOwnProperty('error');
  })
})