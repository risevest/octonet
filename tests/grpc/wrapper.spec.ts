import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import path from "path";
import { v4 as uuidv4 } from "uuid";

import * as jwt from "../../src/http/jwt";
import { GrpcError } from "../../src/grpc/errors";
import { GrpcRequestWrapper, StubResolver } from "../../src/grpc/wrapper";
import { randomString } from "../helpers";
import { EchoResponse, startGrpcServer, stopGrpcServer } from "./server";

chai.use(chaiAsPromised);

const PROTO_PATH = path.join(__dirname, "test.proto");
const secret = new TextEncoder().encode(randomString(32));
const scheme = "Test";
const authConfig = { secret, scheme, timeout: "10s" };
const service = "test_service";

let grpcServer: grpc.Server;
let serverAddress: string;
let resolver: StubResolver;

beforeAll(async () => {
  let port: number;
  [grpcServer, port] = await startGrpcServer();
  serverAddress = `localhost:${port}`;

  const packageDef = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });
  const proto = grpc.loadPackageDefinition(packageDef) as any;
  const stub = new proto.test.TestService(serverAddress, grpc.credentials.createInsecure());
  // resolver always returns the pre-built stub so wrapper tests stay focused
  // on wrapper behaviour and don't exercise stub caching
  resolver = () => stub;
});

afterAll(async () => {
  await stopGrpcServer(grpcServer);
});

/** Convenience: wrapper that already has .via() set for the Echo method. */
function echo(msg: string) {
  return new GrpcRequestWrapper(resolver, service, authConfig, "Echo", { message: msg }).via(
    serverAddress,
    PROTO_PATH,
    "test.TestService"
  );
}

/** Convenience: wrapper that already has .via() set for the Fail method. */
function fail() {
  return new GrpcRequestWrapper(resolver, service, authConfig, "Fail", { message: "" }).via(
    serverAddress,
    PROTO_PATH,
    "test.TestService"
  );
}

describe("GrpcRequestWrapper#via", () => {
  it("should throw when .do() is called without .via()", async () => {
    const wrapper = new GrpcRequestWrapper(resolver, service, authConfig, "Echo", { message: "hello" });
    await expect(wrapper.do()).to.be.rejectedWith(/No connection specified/);
  });
});

describe("GrpcRequestWrapper#auth", () => {
  it("should forward the authorization header from an Express request", async () => {
    const token = randomString(32);
    const req: any = { headers: { authorization: `Bearer ${token}` } };

    const res = await echo("hello").auth(req).do<EchoResponse>();

    expect(res.authorization).to.eq(`Bearer ${token}`);
  });

  it("should throw when an Express request has no authorization header", () => {
    const req: any = { headers: {} };
    expect(() => echo("hello").auth(req)).to.throw(/requires an authorization token/);
  });

  it("should generate a JWT from a session object", async () => {
    const session = { user_id: "abc123", role: "admin" };

    const res = await echo("hello").auth(session).do<EchoResponse>();

    expect(res.authorization).to.match(new RegExp(`^${scheme}\\s.+`));
    const [, token] = res.authorization.split(" ");
    const decoded = await jwt.decode(secret, token);
    expect(decoded.user_id).to.eq(session.user_id);
    expect(decoded.role).to.eq(session.role);
  });

  it("should generate a default system JWT when called with no args", async () => {
    const res = await echo("hello").auth().do<EchoResponse>();

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

    const res = await echo("hello").track(req).do<EchoResponse>();

    expect(res.request_id).to.eq(requestId);
    expect(res.origin_service).to.eq(service);
  });

  it("should generate a new UUID when called without a request", async () => {
    const res = await echo("hello").track().do<EchoResponse>();

    expect(res.request_id).to.be.a("string").with.length(36);
    expect(res.origin_service).to.eq(service);
  });
});

describe("GrpcRequestWrapper#set", () => {
  it("should attach arbitrary metadata without affecting the response", async () => {
    const res = await echo("hello").set("x-custom", "value").do<EchoResponse>();

    expect(res.message).to.eq("hello");
  });
});

describe("GrpcRequestWrapper#do", () => {
  it("should execute the RPC and return the typed response", async () => {
    const res = await echo("ping").do<EchoResponse>();

    expect(res.message).to.eq("ping");
  });

  it("should reject with GrpcError on a server-side error", async () => {
    await expect(fail().do()).to.be.rejectedWith(GrpcError);
  });

  it("should surface the correct code and details in GrpcError", async () => {
    let err: GrpcError | undefined;
    try {
      await fail().do();
    } catch (e) {
      err = e as GrpcError;
    }

    expect(err).to.be.instanceOf(GrpcError);
    expect(err!.code).to.eq(grpc.status.INVALID_ARGUMENT);
    expect(err!.details).to.eq("intentional failure");
  });

  it("should respect the deadline and reject with a timeout error", async () => {
    await expect(echo("slow").do(0)).to.be.rejectedWith(GrpcError);
  });
});
