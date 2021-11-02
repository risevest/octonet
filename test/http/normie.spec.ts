import { expect } from "chai";
import { before } from "mocha";
import { v4 } from "uuid";
import crypto from "crypto";
import { Client } from "../../src";
import { APIError, HttpError, NoRequestIDError } from "../../src/http/errors";
import { NoAuthorizationTokenError } from "../../src/http/errors";
import { startServer, stopServer, TestResponse } from "./server";
import { Server } from "http";

let httpClient: Client;
let server: Server;
let mockServerUrl: string;
let headers = {};

const body = { foo: 'bar' };
const service = 'test_service';
const token = crypto.createHmac("sha256", 'secret').update('key').digest("hex");
const requestId = v4();


before(async () => {
  server = await startServer(4040) as Server;
  mockServerUrl = `http://localhost:${4040}`;
})

after(async () => {
  await stopServer(server);
})


beforeEach(() => {
  httpClient = new Client(service);
  headers = {};
})

describe("Client#get", () => {
  it("should throw error if request id isn't provided", async () => {
    const url = `${mockServerUrl}/test`;
    headers = { "authorization": token };
    expect(httpClient.get.bind(httpClient, url, headers)).to.throw(NoRequestIDError);
  })

  it("should throw error if auth token isn't provided", async () => {
    const url = `${mockServerUrl}/test`;
    headers = { "x-request-id": requestId };
    expect(httpClient.get.bind(httpClient, url, headers)).to.throw(NoAuthorizationTokenError);
  })

  it("should throw error if URL isn't found", async () => {
    const url = `${mockServerUrl}/test/not-found`;
    headers = { "x-request-id": requestId, authorization: token };
    let changed = false;
    try {
      await httpClient.get(url, headers)
      changed = true;
    } catch (err) {
      expect(err).to.be.instanceOf(APIError);
    }
    expect(changed).to.be.equal(false);
  })

  it("should throw error if remote server isn't found", async () => {
    const url = `http://localhost:40410/test`;
    headers = { "x-request-id": requestId, authorization: token };
    let changed = false;
    try {
      await httpClient.get(url, headers)
    } catch (err) {
      expect(err).to.be.instanceOf(HttpError);
    }
    expect(changed).to.be.equal(false);
  })

  it("should return a response of type T if all is provided", async () => {
    const url = `${mockServerUrl}/test`;
    headers = { "x-request-id": requestId, authorization: token };
    const res = await httpClient.get<TestResponse>(url, headers);
    expect(res).to.haveOwnProperty('data');
    expect(res).to.haveOwnProperty('error');
  })
})


describe("Client#post", () => {
  it("should throw error if request id isn't provided", async () => {
    const url = `${mockServerUrl}/test`;
    headers = { "authorization": token };
    expect(httpClient.post.bind(httpClient, url, body, headers)).to.throw(NoRequestIDError);
  })

  it("should throw error if auth token isn't provided", async () => {
    const url = `${mockServerUrl}/test`;
    headers = { "x-request-id": requestId };
    expect(httpClient.post.bind(httpClient, url, body, headers)).to.throw(NoAuthorizationTokenError);
  })

  it("should return a response of type T if all is provided", async () => {
    const url = `${mockServerUrl}/test`;
    headers = { "x-request-id": requestId, authorization: token };
    const res = await httpClient.post<TestResponse>(url, body, headers);
    expect(res).to.haveOwnProperty('data');
    expect(res).to.haveOwnProperty('error');
  })
})

describe("Client#put", () => {
  it("should throw error if request id isn't provided", async () => {
    const url = `${mockServerUrl}/test/som_random_id`;
    headers = { "authorization": token };
    expect(httpClient.put.bind(httpClient, url, body, headers)).to.throw(NoRequestIDError);
  })

  it("should throw error if auth token isn't provided", async () => {
    const url = `${mockServerUrl}/test/som_random_id`;
    headers = { "x-request-id": requestId };
    expect(httpClient.put.bind(httpClient, url, body, headers)).to.throw(NoAuthorizationTokenError);
  })

  it("should return a response of type T if all is provided", async () => {
    const url = `${mockServerUrl}/test/som_random_id`;
    headers = { "x-request-id": requestId, authorization: token };
    const res = await httpClient.put<TestResponse>(url, body, headers);
    expect(res).to.haveOwnProperty('data');
    expect(res).to.haveOwnProperty('error');
  })
})

describe("Client#patch", () => {
  it("should throw error if request id isn't provided", async () => {
    const url = `${mockServerUrl}/test/som_random_id`;
    headers = { "authorization": token };
    expect(httpClient.patch.bind(httpClient, url, body, headers)).to.throw(NoRequestIDError);
  })

  it("should throw error if auth token isn't provided", async () => {
    const url = `${mockServerUrl}/test/som_random_id`;
    headers = { "x-request-id": requestId };
    expect(httpClient.patch.bind(httpClient, url, body, headers)).to.throw(NoAuthorizationTokenError);
  })

  it("should return a response of type T if all is provided", async () => {
    const url = `${mockServerUrl}/test/som_random_id`;
    headers = { "x-request-id": requestId, authorization: token };
    const res = await httpClient.patch<TestResponse>(url, body, headers);
    expect(res).to.haveOwnProperty('data');
    expect(res).to.haveOwnProperty('error');
  })
})

describe("Client#delete", () => {
  it("should throw error if request id isn't provided", async () => {
    const url = `${mockServerUrl}/test/som_random_id`;
    headers = { "authorization": token };
    expect(httpClient.delete.bind(httpClient, url, body, headers)).to.throw(NoRequestIDError);
  })

  it("should throw error if auth token isn't provided", async () => {
    const url = `${mockServerUrl}/test/som_random_id`;
    headers = { "x-request-id": requestId };
    expect(httpClient.delete.bind(httpClient, url, body, headers)).to.throw(NoAuthorizationTokenError);
  })

  it("should return a response of type T if all is provided", async () => {
    const url = `${mockServerUrl}/test/som_random_id`;
    headers = { "x-request-id": requestId, authorization: token };
    const res = await httpClient.delete<TestResponse>(url, body, headers);
    expect(res).to.haveOwnProperty('data');
    expect(res).to.haveOwnProperty('error');
  })
})