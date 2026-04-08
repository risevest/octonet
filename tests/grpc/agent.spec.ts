import * as grpc from "@grpc/grpc-js";
import { expect } from "chai";
import path from "path";

import { GrpcAgent } from "../../src/grpc/agent";
import { GrpcRequestWrapper } from "../../src/grpc/wrapper";
import { randomString } from "../helpers";
import { EchoResponse, startGrpcServer, stopGrpcServer } from "./server";

const PROTO_PATH = path.join(__dirname, "test.proto");
const agentConfig = { service: "test_service", scheme: "Test", secret: randomString(32) };

let grpcServer: grpc.Server;
let port: number;

beforeAll(async () => {
  [grpcServer, port] = await startGrpcServer();
});

afterAll(async () => {
  await stopGrpcServer(grpcServer);
});

describe("GrpcAgent constructor", () => {
  it("should throw when the service is not found in the proto", () => {
    expect(
      () =>
        new GrpcAgent(agentConfig, {
          address: `localhost:${port}`,
          protoPath: PROTO_PATH,
          service: "test.NonExistent"
        })
    ).to.throw(/NonExistent.+not found/);
  });

  it("should construct successfully with a valid service path", () => {
    expect(
      () =>
        new GrpcAgent(agentConfig, {
          address: `localhost:${port}`,
          protoPath: PROTO_PATH,
          service: "test.TestService"
        })
    ).to.not.throw();
  });
});

describe("GrpcAgent#call", () => {
  let agent: GrpcAgent;

  beforeAll(() => {
    agent = new GrpcAgent(agentConfig, {
      address: `localhost:${port}`,
      protoPath: PROTO_PATH,
      service: "test.TestService"
    });
  });

  it("should return a GrpcRequestWrapper", () => {
    const wrapper = agent.call("Echo", { message: "hello" });
    expect(wrapper).to.be.instanceOf(GrpcRequestWrapper);
  });

  it("should execute an RPC end-to-end", async () => {
    const res = await agent.call("Echo", { message: "grpc-agent" }).do<EchoResponse>();
    expect(res.message).to.eq("grpc-agent");
  });

  it("should execute an authenticated call end-to-end", async () => {
    const res = await agent.call("Echo", { message: "auth-test" }).auth().do<EchoResponse>();
    expect(res.authorization).to.match(/^Test\s.+/);
  });

  it("should execute a tracked call end-to-end", async () => {
    const res = await agent.call("Echo", { message: "track-test" }).track().do<EchoResponse>();
    expect(res.request_id).to.be.a("string").with.length(36);
    expect(res.origin_service).to.eq(agentConfig.service);
  });

  it("should chain auth and track together", async () => {
    const res = await agent.call("Echo", { message: "chained" }).auth().track().do<EchoResponse>();
    expect(res.authorization).to.match(/^Test\s.+/);
    expect(res.request_id).to.be.a("string").with.length(36);
  });
});
