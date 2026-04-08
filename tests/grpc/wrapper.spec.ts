import * as grpc from "@grpc/grpc-js";
import * as jwt from "../../src/http/jwt";
import * as protoLoader from "@grpc/proto-loader";

import { EchoResponse, startGrpcServer, stopGrpcServer } from "./server";
import chai, { expect } from "chai";

import { GrpcError } from "../../src/grpc/errors";
import { GrpcRequestWrapper } from "../../src/grpc/wrapper";
import chaiAsPromised from "chai-as-promised";
import path from "path";
import { randomString } from "../helpers";
import { v4 as uuidv4 } from "uuid";

chai.use(chaiAsPromised);

const PROTO_PATH = path.join(__dirname, "test.proto");
const secret = new TextEncoder().encode(randomString(32));
const scheme = "Test";
const authConfig = { secret, scheme, timeout: "10s" };
const service = "test_service";

let grpcServer: grpc.Server;
let stub: any;

beforeAll(async () => {
  let port: number;
  [grpcServer, port] = await startGrpcServer();

  const packageDef = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });
  const proto = grpc.loadPackageDefinition(packageDef) as any;
  stub = new proto.test.TestService(`localhost:${port}`, grpc.credentials.createInsecure());
});

afterAll(async () => {
  await stopGrpcServer(grpcServer);
});

describe("GrpcRequestWrapper#auth", () => {
  it("should forward the authorization header from an Express request", async () => {
    const token = randomString(32);
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const wrapper = new GrpcRequestWrapper(stub, service, authConfig, "Echo", { message: "hello" });

    const res = await wrapper.auth(req).do<EchoResponse>();

    expect(res.authorization).to.eq(`Bearer ${token}`);
  });

  it("should send no authorization when Express request has no header", async () => {
    const req: any = { headers: {} };
    const wrapper = new GrpcRequestWrapper(stub, service, authConfig, "Echo", { message: "hello" });

    const res = await wrapper.auth(req).do<EchoResponse>();

    expect(res.authorization).to.eq("");
  });

  it("should generate a JWT from a session object", async () => {
    const session = { user_id: "abc123", role: "admin" };
    const wrapper = new GrpcRequestWrapper(stub, service, authConfig, "Echo", { message: "hello" });

    const res = await wrapper.auth(session).do<EchoResponse>();

    expect(res.authorization).to.match(new RegExp(`^${scheme}\\s.+`));
    const [, token] = res.authorization.split(" ");
    const decoded = await jwt.decode(secret, token);
    expect(decoded.user_id).to.eq(session.user_id);
    expect(decoded.role).to.eq(session.role);
  });

  it("should generate a default system JWT when called with no args", async () => {
    const wrapper = new GrpcRequestWrapper(stub, service, authConfig, "Echo", { message: "hello" });

    const res = await wrapper.auth().do<EchoResponse>();

    expect(res.authorization).to.match(new RegExp(`^${scheme}\\s.+`));
    const [, token] = res.authorization.split(" ");
    const decoded = await jwt.decode(secret, token);
    expect(decoded.service).to.eq(service);
    expect(Date.parse(decoded.request_time)).to.not.be.NaN;
  });
});

describe("GrpcRequestWrapper#track", () => {
  it("should forward x-request-id from an Express request", async () => {
    const requestId = uuidv4();
    const req: any = { headers: { "x-request-id": requestId } };
    const wrapper = new GrpcRequestWrapper(stub, service, authConfig, "Echo", { message: "hello" });

    const res = await wrapper.track(req).do<EchoResponse>();

    expect(res.request_id).to.eq(requestId);
    expect(res.origin_service).to.eq(service);
  });

  it("should generate a new UUID when called without a request", async () => {
    const wrapper = new GrpcRequestWrapper(stub, service, authConfig, "Echo", { message: "hello" });

    const res = await wrapper.track().do<EchoResponse>();

    expect(res.request_id).to.be.a("string").with.length(36);
    expect(res.origin_service).to.eq(service);
  });
});

describe("GrpcRequestWrapper#set", () => {
  it("should attach arbitrary metadata without affecting the response", async () => {
    const wrapper = new GrpcRequestWrapper(stub, service, authConfig, "Echo", { message: "hello" });

    const res = await wrapper.set("x-custom", "value").do<EchoResponse>();

    expect(res.message).to.eq("hello");
  });
});

describe("GrpcRequestWrapper#do", () => {
  it("should execute the RPC and return the typed response", async () => {
    const wrapper = new GrpcRequestWrapper(stub, service, authConfig, "Echo", { message: "ping" });

    const res = await wrapper.do<EchoResponse>();

    expect(res.message).to.eq("ping");
  });

  it("should reject with GrpcError on a server-side error", async () => {
    const wrapper = new GrpcRequestWrapper(stub, service, authConfig, "Fail", { message: "hello" });

    await expect(wrapper.do()).to.be.rejectedWith(GrpcError);
  });

  it("should surface the correct code and details in GrpcError", async () => {
    const wrapper = new GrpcRequestWrapper(stub, service, authConfig, "Fail", { message: "hello" });

    let err: GrpcError | undefined;
    try {
      await wrapper.do();
    } catch (e) {
      err = e as GrpcError;
    }

    expect(err).to.be.instanceOf(GrpcError);
    expect(err!.code).to.eq(grpc.status.INVALID_ARGUMENT);
    expect(err!.details).to.eq("intentional failure");
  });

  it("should respect the deadline and reject with a timeout error", async function () {
    // Use a 0-second deadline — the call cannot complete that fast
    const wrapper = new GrpcRequestWrapper(stub, service, authConfig, "Echo", { message: "slow" });

    await expect(wrapper.do(0)).to.be.rejectedWith(GrpcError);
  });
});
