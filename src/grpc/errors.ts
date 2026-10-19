import * as grpc from "@grpc/grpc-js";

/**
 * Thrown when a gRPC call returns a non-OK status.
 * Analogous to `APIError` in the HTTP module.
 */
export class GrpcError extends Error {
  readonly code: grpc.status;
  readonly details: string;
  readonly cause?: unknown;

  constructor(service: string, method: string, err: grpc.ServiceError) {
    const status = grpc.status[err.code] ?? err.code;
    super(`gRPC call ${service}/${method} failed with status ${status}: ${err.details}`);
    this.name = "GrpcError";
    this.code = err.code;
    this.details = err.details;
    this.cause = err;
  }
}

/** Thrown when the proto file has no service matching the requested path. */
export class GrpcServiceNotFoundError extends Error {
  constructor(service: string, protoPath: string) {
    super(`Service "${service}" not found in proto file: ${protoPath}`);
    this.name = "GrpcServiceNotFoundError";
  }
}

/** Thrown when the resolved stub has no method with the requested name. */
export class GrpcMethodNotFoundError extends Error {
  constructor(service: string, method: string) {
    super(`gRPC method "${method}" does not exist on service "${service}"`);
    this.name = "GrpcMethodNotFoundError";
  }
}
