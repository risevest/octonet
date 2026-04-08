import * as grpc from "@grpc/grpc-js";

/**
 * Thrown when a gRPC call returns a non-OK status.
 * Analogous to `APIError` in the HTTP module.
 */
export class GrpcError extends Error {
  readonly code: grpc.status;
  readonly details: string;

  constructor(service: string, method: string, err: grpc.ServiceError) {
    super(`gRPC call ${service}/${method} failed with status ${grpc.status[err.code]}: ${err.details}`);
    this.code = err.code;
    this.details = err.details;
  }
}
