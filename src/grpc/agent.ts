import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

import { AgentConfig } from "../http/agent";
import { AuthConfig } from "../http/wrapper";
import { GrpcRequestWrapper } from "./wrapper";

const DEFAULT_LOADER_OPTIONS: protoLoader.Options = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
};

/**
 * Resolves a nested path like "users.UserService" on the loaded proto object.
 */
function resolveService(proto: Record<string, any>, servicePath: string): any {
  return servicePath.split(".").reduce((obj, key) => obj?.[key], proto);
}

/**
 * gRPC client agent. Analogous to `HttpAgent` — configure once, use everywhere.
 *
 * Accepts only auth config at construction time. The target service address and
 * proto file are specified per-call via `.via()`, keeping the agent reusable
 * across any number of downstream gRPC services.
 *
 * Stubs are created lazily and cached by (address, protoPath, service) so the
 * proto-loading and channel-creation overhead is paid at most once per unique
 * connection target.
 *
 * @example
 * const grpcAgent = new GrpcAgent({
 *   service: "rise-moneyio",
 *   scheme: env.auth_scheme,
 *   secret: env.service_secret
 * });
 *
 * const user = await grpcAgent
 *   .call("GetUser", { id })
 *   .via(env.users_grpc_url, path.join(__dirname, "user.proto"), "users.UserService")
 *   .auth()
 *   .track(req)
 *   .do<User>(60);
 */
export class GrpcAgent {
  private readonly stubCache = new Map<string, any>();
  private readonly authConfig: AuthConfig;
  private readonly serviceName: string;

  constructor(agentConfig: AgentConfig) {
    this.authConfig = {
      secret: new TextEncoder().encode(agentConfig.secret),
      scheme: agentConfig.scheme,
      timeout: agentConfig.timeout ?? "10s"
    };
    this.serviceName = agentConfig.service;
  }

  /**
   * Prepare a gRPC call. Returns a fluent `GrpcRequestWrapper` for
   * attaching connection info, auth, tracing, and executing the call.
   *
   * @param method RPC method name as defined in the proto service.
   * @param payload Request message payload.
   *
   * @example
   * grpcAgent
   *   .call("GetUser", { id })
   *   .via(env.users_grpc_url, protoPath, "users.UserService")
   *   .auth()
   *   .track(req)
   *   .do<User>(60)
   */
  call<TR extends object = any>(method: string, payload: TR): GrpcRequestWrapper<TR> {
    return new GrpcRequestWrapper(
      (address, protoPath, service, credentials) =>
        this.resolveStub(address, protoPath, service, credentials),
      this.serviceName,
      this.authConfig,
      method,
      payload
    );
  }

  private resolveStub(
    address: string,
    protoPath: string,
    service: string,
    credentials?: grpc.ChannelCredentials
  ): any {
    const key = `${address}\0${protoPath}\0${service}`;

    if (!this.stubCache.has(key)) {
      const packageDef = protoLoader.loadSync(protoPath, DEFAULT_LOADER_OPTIONS);
      const proto = grpc.loadPackageDefinition(packageDef) as Record<string, any>;
      const ServiceConstructor = resolveService(proto, service);
      if (!ServiceConstructor) {
        throw new Error(`Service "${service}" not found in proto file: ${protoPath}`);
      }
      const creds = credentials ?? grpc.credentials.createInsecure();
      this.stubCache.set(key, new ServiceConstructor(address, creds));
    }

    return this.stubCache.get(key)!;
  }
}
