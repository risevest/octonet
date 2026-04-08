import * as grpc from "@grpc/grpc-js";

import { Action, AuthConfig } from "../http/wrapper";

import { GrpcError } from "./errors";
import { Request } from "express";
import { encode } from "../http/jwt";
import { v4 as uuidv4 } from "uuid";

/**
 * Fluent request builder for a single gRPC call.
 * Mirrors `RequestWrapper` from the HTTP module.
 *
 * @example
 * const user = await grpcAgent
 *   .call("GetUser", { id })
 *   .auth()
 *   .track(req)
 *   .do<User>(60);
 */
export class GrpcRequestWrapper<TRequest extends object> {
  private metadata = new grpc.Metadata();
  private asyncActions: Action[] = [];

  constructor(
    private readonly stub: any,
    private readonly service: string,
    private readonly authConfig: AuthConfig,
    private readonly method: string,
    private readonly payload: TRequest
  ) {}

  /**
   * Push async work to run just before the call is made,
   * keeping the builder API synchronous.
   */
  private defer(action: Action): this {
    this.asyncActions.push(action);
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
        throw new Error(
          `gRPC call ${this.service}/${this.method} requires an authorization token`
        );
      }
      this.metadata.set("authorization", authHeader);
      return this;
    }

    const session = reqOrSession ?? { service: this.service, request_time: new Date() };

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
    this.metadata.set("x-origin-service", this.service);
    return this;
  }

  /**
   * Set additional metadata key/value pairs.
   */
  set(key: string, value: string): this {
    this.metadata.set(key, value);
    return this;
  }

  /**
   * Execute the RPC call.
   * @param deadline timeout in seconds (default: 30)
   */
  async do<TResponse = any>(deadline = 30): Promise<TResponse> {
    for (const action of this.asyncActions) {
      await action();
    }

    const callOptions: grpc.CallOptions = {
      deadline: new Date(Date.now() + deadline * 1000)
    };

    if (typeof this.stub[this.method] !== "function") {
      throw new Error(`gRPC method "${this.method}" does not exist on stub for service "${this.service}"`);
    }

    return new Promise<TResponse>((resolve, reject) => {
      this.stub[this.method](
        this.payload,
        this.metadata,
        callOptions,
        (err: grpc.ServiceError | null, response: TResponse) => {
          if (err) {
            return reject(new GrpcError(this.service, this.method, err));
          }
          resolve(response);
        }
      );
    });
  }
}
