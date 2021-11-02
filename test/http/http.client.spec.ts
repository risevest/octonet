import app from "./server";
import http from "http";
import { InternetService } from "../../src/net/internet";
import { expect } from "chai";

before(() => {
  http.createServer(app).listen(8080);
});

const httpClient = new InternetService(200, {});
const baseUrl = "http://localhost:8080";

describe("HttpClient#Get", () => {
  it("returns correct data", async () => {
    const data = await httpClient.get(baseUrl, {});
    expect(data.message).to.be.equal("Hello World");
  });

  it("can add authorization headers", async () => {
    const data = await httpClient.get(`${baseUrl}/auth`, { authorization: "Bearer" });
    expect(data.message).to.be.equal("authorized");
  });
});
