import * as grpc from "@grpc/grpc-js";
import { Request } from "express";
import { v4 as uuidv4 } from "uuid";

import { encode } from "../http/jwt";
import { Action, AuthConfig } from "../http/wrapper";
import { GrpcError } from "./errors";

/**
 * Resolves a gRPC stub for a given connection target.
 * Provided by `GrpcAgent`, which caches stubs to avoid repeated proto loading.
 */
export type StubResolver = (
  address: string,
  protoPath: string,
  service: string,
  credentials?: grpc.ChannelCredentials
) => any;

/**
 * Fluent request builder for a single gRPC call.
 * Mirrors `RequestWrapper` from the HTTP module.
 *
 * @example
 * const user = await grpcAgent
 *   .call("GetUser", { id })
 *   .via(env.users_grpc_url, path.join(__dirname, "user.proto"), "users.UserService")
 *   .auth()
 *   .track(req)
 *   .do<User>(60);
 */
export class GrpcRequestWrapper<TRequest extends object> {
  private metadata = new grpc.Metadata();
  private asyncActions: Action[] = [];
  private connection?: {
    address: string;
    protoPath: string;
    service: string;
    credentials?: grpc.ChannelCredentials;
  };

  constructor(
    private readonly resolveStub: StubResolver,
    private readonly serviceName: string,
    private readonly authConfig: AuthConfig,
    private readonly method: string,
    private readonly payload: TRequest
  ) {}

  private defer(action: Action): this {
    this.asyncActions.push(action);
    return this;
  }

  /**
   * Specify the gRPC server to call.
   *
   * @param address gRPC server address — host:port.
   * @param protoPath Absolute path to the .proto file defining the service.
   * @param service Fully qualified service name, e.g. "users.UserService".
   * @param credentials Channel credentials. Defaults to insecure.
   */
  via(address: string, protoPath: string, service: string, credentials?: grpc.ChannelCredentials): this {
    this.connection = { address, protoPath, service, credentials };
    return this;
  }

  /**
   * Attach authorization metadata to the call.
   *
   * - `auth(req)` — forwards the Authorization header from an Express request.
   * - `auth(session)` — generates a system JWT from a session/payload object.
   * - `auth()` — generates a system JWT scoped to the calling service.
   */
  auth(reqOrSession?: Request | Record<string, any>): this {
    const isExpressReq = reqOrSession && "headers" in reqOrSession;

    if (isExpressReq) {
      const authHeader = (reqOrSession as Request).headers.authorization;
      if (!authHeader) {
        throw new Error(`gRPC call ${this.serviceName}/${this.method} requires an authorization token`);
      }
      this.metadata.set("authorization", authHeader);
      return this;
    }

    const session = reqOrSession ?? { service: this.serviceName, request_time: new Date() };

    return this.defer(async () => {
      const token = await encode(this.authConfig.secret, this.authConfig.timeout, session);
      this.metadata.set("authorization", `${this.authConfig.scheme} ${token}`);
    });
  }

  /**
   * Enable distributed tracing on the call.
   * Forwards x-request-id from an Express request, or generates a new one.
   * Also sets x-origin-service so the receiver knows where the call came from.
   */
  track(req?: Request): this {
    const requestId = req?.headers["x-request-id"] as string | undefined;
    this.metadata.set("x-request-id", requestId ?? uuidv4());
    this.metadata.set("x-origin-service", this.serviceName);
    return this;
  }

  /**
   * Set an additional metadata key/value pair.
   */
  set(key: string, value: string): this {
    this.metadata.set(key, value);
    return this;
  }

  /**
   * Execute the RPC call.
   *
   * @param deadline timeout in seconds (default: 30)
   */
  async do<TResponse = any>(deadline = 30): Promise<TResponse> {
    if (!this.connection) {
      throw new Error(
        `No connection specified for gRPC call ${this.serviceName}/${this.method}. ` +
          `Call .via(address, protoPath, service) before .do()`
      );
    }

    for (const action of this.asyncActions) {
      await action();
    }

    const stub = this.resolveStub(
      this.connection.address,
      this.connection.protoPath,
      this.connection.service,
      this.connection.credentials
    );

    if (typeof stub[this.method] !== "function") {
      throw new Error(
        `gRPC method "${this.method}" does not exist on stub for service "${this.serviceName}"`
      );
    }

    const callOptions: grpc.CallOptions = {
      deadline: new Date(Date.now() + deadline * 1000)
    };

    return new Promise<TResponse>((resolve, reject) => {
      stub[this.method](
        this.payload,
        this.metadata,
        callOptions,
        (err: grpc.ServiceError | null, response: TResponse) => {
          if (err) return reject(new GrpcError(this.serviceName, this.method, err));
          resolve(response);
        }
      );
    });
  }
}
