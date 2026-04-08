import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

import { AgentConfig } from "../http/agent";
import { AuthConfig } from "../http/wrapper";
import { GrpcRequestWrapper } from "./wrapper";

export interface GrpcAgentConfig {
  /**
   * gRPC server address — host:port.
   * @example "localhost:50051"
   */
  address: string;

  /**
   * Absolute path to the .proto file defining the service.
   */
  protoPath: string;

  /**
   * Fully qualified service name in the proto package.
   * @example "users.UserService"
   */
  service: string;

  /**
   * gRPC channel credentials. Defaults to insecure (suitable for
   * internal cluster traffic). Pass `grpc.credentials.createSsl()`
   * for TLS.
   */
  credentials?: grpc.ChannelCredentials;

  /**
   * proto-loader options. Defaults match the standard gRPC-js recommendations.
   */
  loaderOptions?: protoLoader.Options;
}

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
function resolveService(proto: Record<string, any>, path: string): any {
  return path.split(".").reduce((obj, key) => obj?.[key], proto);
}

/**
 * gRPC client agent. Analogous to `HttpAgent` — configure once, use everywhere.
 *
 * Loads the proto file and creates the service stub on construction so the
 * overhead is paid once, not on every call.
 *
 * @example
 * const grpcAgent = new GrpcAgent(
 *   { service: "rise-moneyio", scheme: env.auth_scheme, secret: env.service_secret },
 *   { address: env.users_grpc_url, protoPath: path.join(__dirname, "user.proto"), service: "users.UserService" }
 * );
 *
 * // usage
 * const user = await grpcAgent
 *   .call("GetUser", { id })
 *   .auth()
 *   .track(req)
 *   .do<User>(60);
 */
export class GrpcAgent {
  private readonly stub: any;
  private readonly authConfig: AuthConfig;
  private readonly serviceName: string;

  constructor(agentConfig: AgentConfig, grpcConfig: GrpcAgentConfig) {
    const loaderOptions = { ...DEFAULT_LOADER_OPTIONS, ...grpcConfig.loaderOptions };
    const packageDef = protoLoader.loadSync(grpcConfig.protoPath, loaderOptions);
    const proto = grpc.loadPackageDefinition(packageDef) as Record<string, any>;

    const ServiceConstructor = resolveService(proto, grpcConfig.service);
    if (!ServiceConstructor) {
      throw new Error(`Service "${grpcConfig.service}" not found in proto file: ${grpcConfig.protoPath}`);
    }

    const credentials = grpcConfig.credentials ?? grpc.credentials.createInsecure();
    this.stub = new ServiceConstructor(grpcConfig.address, credentials);

    this.authConfig = {
      secret: new TextEncoder().encode(agentConfig.secret),
      scheme: agentConfig.scheme,
      timeout: agentConfig.timeout ?? "10s"
    };

    this.serviceName = agentConfig.service;
  }

  /**
   * Prepare a gRPC call. Returns a fluent `GrpcRequestWrapper` for
   * attaching auth, tracing, and executing the call.
   *
   * @param method RPC method name as defined in the proto service.
   * @param payload Request message payload.
   *
   * @example
   * grpcAgent.call("GetUser", { id }).auth().track(req).do<User>(60)
   */
  call<TR extends object = any>(method: string, payload: TR): GrpcRequestWrapper<TR> {
    return new GrpcRequestWrapper(this.stub, this.serviceName, this.authConfig, method, payload);
  }
}
