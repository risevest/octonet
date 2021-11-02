import { expect } from "chai";
import { Server } from "http";
import { before } from "mocha";
import { BaseClient } from "../../src";
import { APIError, HttpError } from "../../src/http/errors";
import { startServer, stopServer, TestResponse } from "./server";

let httpClient: BaseClient;
let server: Server;
let mockServerUrl: string;

const body = { foo: 'bar' };
const service = 'test_service';


before(async () => {
  server = await startServer(4050) as Server;
  mockServerUrl = `http://localhost:${4050}`;
})

after(async () => {
  await stopServer(server);
})


beforeEach(() => {
  httpClient = new BaseClient(service);
})

describe("BaseClient#get", () => {
  it("should throw error if URL isn't found", async () => {
    const url = `${mockServerUrl}/test/not-found`;
    let changed = false;
    try {
      await httpClient.get(url)
      changed = true;
    } catch (err) {
      expect(err).to.be.instanceOf(APIError);
    }
    expect(changed).to.be.equal(false);
  })

  it("should throw error if remote server isn't found", async () => {
    const url = `http://localhost:40410/test`;
    let changed = false;
    try {
      await httpClient.get(url)
    } catch (err) {
      expect(err).to.be.instanceOf(HttpError);
    }
    expect(changed).to.be.equal(false);
  })

  it("should return a response of type T if all is provided", async () => {
    const url = `${mockServerUrl}/test`;
    const res = await httpClient.get<TestResponse>(url);
    expect(res).to.haveOwnProperty('data');
    expect(res).to.haveOwnProperty('error');
  })
})


describe("BaseClient#post", () => {
  it("should return a response of type T if all is provided", async () => {
    const url = `${mockServerUrl}/test`;
    const res = await httpClient.post<TestResponse>(url, body);
    expect(res).to.haveOwnProperty('data');
    expect(res).to.haveOwnProperty('error');
  })
})

describe("Baselient#put", () => {
  it("should return a response of type T if all is provided", async () => {
    const url = `${mockServerUrl}/test/som_random_id`;
    const res = await httpClient.put<TestResponse>(url, body);
    expect(res).to.haveOwnProperty('data');
    expect(res).to.haveOwnProperty('error');
  })
})

describe("BaseClient#patch", () => {
  it("should return a response of type T if all is provided", async () => {
    const url = `${mockServerUrl}/test/som_random_id`;
    const res = await httpClient.patch<TestResponse>(url, body);
    expect(res).to.haveOwnProperty('data');
    expect(res).to.haveOwnProperty('error');
  })
})

describe("BaseClient#delete", () => {
  it("should return a response of type T if all is provided", async () => {
    const url = `${mockServerUrl}/test/som_random_id`;
    const res = await httpClient.delete<TestResponse>(url, body);
    expect(res).to.haveOwnProperty('data');
    expect(res).to.haveOwnProperty('error');
  })
})