import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import faker from "faker";
import { Server } from "http";
import { before } from "mocha";
import { APIError, HttpClient, HttpMethod, TimeoutError } from "../../src";
import { createTestApp, startServer, stopServer, TestRequest } from "./server";

chai.use(chaiAsPromised);

const httpClient = new HttpClient();
let server: Server;
let port: number;
let mockServerURL: string;
let mockResourceURL: string;

before(async () => {
  const app = createTestApp();
  [server, port] = await startServer(app);
  mockServerURL = `http://localhost:${port}`;
  mockResourceURL = `${mockServerURL}/test`;
});

after(async () => {
  await stopServer(server);
});

describe("HttpClient#doRequest", () => {
  it("run a basic request", async () => {
    const body = { first_name: faker.name.firstName() };
    const data = await httpClient.do<TestRequest>({
      method: HttpMethod.POST,
      url: mockResourceURL,
      data: body
    });

    expect(data.method).to.be.eq(HttpMethod.POST);
    expect(data.body).to.be.eql(body);
  });

  it("cause a timeout with 500ms timeout", async function () {
    this.timeout(1500);
    const req = { method: HttpMethod.GET, url: `${mockResourceURL}/timeout` };
    await expect(httpClient.do(req, 0.5)).rejectedWith(TimeoutError);
  });

  it("not cause a timeout with 5s timeout", async function () {
    this.timeout(1500);
    const req = { method: HttpMethod.GET, url: `${mockResourceURL}/timeout` };
    await expect(httpClient.do(req, 5)).fulfilled;
  });

  it("handles API errors", async function () {
    const req = { method: HttpMethod.GET, url: `${mockResourceURL}/error` };
    const promise = httpClient.do(req);
    await expect(promise).rejectedWith(APIError);

    let err: APIError;
    try {
      await promise;
    } catch (error) {
      err = error;
    }

    expect(err.status).to.be.eq(422);
    expect(err.data).to.haveOwnProperty("message");
  });
});
