import * as grpc from "@grpc/grpc-js";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import path from "path";

import { GrpcAgent } from "../../src/grpc/agent";
import { GrpcRequestWrapper } from "../../src/grpc/wrapper";
import { randomString } from "../helpers";
import { EchoResponse, startGrpcServer, stopGrpcServer } from "./server";

chai.use(chaiAsPromised);

const PROTO_PATH = path.join(__dirname, "test.proto");
const agentConfig = { service: "test_service", scheme: "Test", secret: randomString(32) };

let grpcServer: grpc.Server;
let serverAddress: string;

beforeAll(async () => {
  let port: number;
  [grpcServer, port] = await startGrpcServer();
  serverAddress = `localhost:${port}`;
});

afterAll(async () => {
  await stopGrpcServer(grpcServer);
});

describe("GrpcAgent constructor", () => {
  it("should construct with only auth config", () => {
    expect(() => new GrpcAgent(agentConfig)).to.not.throw();
  });
});

describe("GrpcAgent#call", () => {
  let agent: GrpcAgent;

  beforeAll(() => {
    agent = new GrpcAgent(agentConfig);
  });

  it("should return a GrpcRequestWrapper", () => {
    const wrapper = agent.call("Echo", { message: "hello" });
    expect(wrapper).to.be.instanceOf(GrpcRequestWrapper);
  });

  it("should reject on .do() when the service is not found in the proto", async () => {
    await expect(
      agent.call("Echo", { message: "hello" }).via(serverAddress, PROTO_PATH, "test.NonExistent").do()
    ).to.be.rejectedWith(/NonExistent.+not found/);
  });

  it("should execute an RPC end-to-end", async () => {
    const res = await agent
      .call("Echo", { message: "grpc-agent" })
      .via(serverAddress, PROTO_PATH, "test.TestService")
      .do<EchoResponse>();

    expect(res.message).to.eq("grpc-agent");
  });

  it("should execute an authenticated call end-to-end", async () => {
    const res = await agent
      .call("Echo", { message: "auth-test" })
      .via(serverAddress, PROTO_PATH, "test.TestService")
      .auth()
      .do<EchoResponse>();

    expect(res.authorization).to.match(/^Test\s.+/);
  });

  it("should execute a tracked call end-to-end", async () => {
    const res = await agent
      .call("Echo", { message: "track-test" })
      .via(serverAddress, PROTO_PATH, "test.TestService")
      .track()
      .do<EchoResponse>();

    expect(res.request_id).to.be.a("string").with.length(36);
    expect(res.origin_service).to.eq(agentConfig.service);
  });

  it("should chain auth and track together", async () => {
    const res = await agent
      .call("Echo", { message: "chained" })
      .via(serverAddress, PROTO_PATH, "test.TestService")
      .auth()
      .track()
      .do<EchoResponse>();

    expect(res.authorization).to.match(/^Test\s.+/);
    expect(res.request_id).to.be.a("string").with.length(36);
  });

  it("should cache the stub and reuse it across calls", async () => {
    const [res1, res2] = await Promise.all([
      agent
        .call("Echo", { message: "first" })
        .via(serverAddress, PROTO_PATH, "test.TestService")
        .do<EchoResponse>(),
      agent
        .call("Echo", { message: "second" })
        .via(serverAddress, PROTO_PATH, "test.TestService")
        .do<EchoResponse>()
    ]);

    expect(res1.message).to.eq("first");
    expect(res2.message).to.eq("second");
  });
});
