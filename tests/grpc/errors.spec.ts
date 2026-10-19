import * as grpc from "@grpc/grpc-js";

import { GrpcError } from "../../src/grpc/errors";
import { expect } from "chai";

function makeServiceError(code: grpc.status, details: string): grpc.ServiceError {
  return Object.assign(new Error(details), {
    code,
    details,
    metadata: new grpc.Metadata()
  }) as grpc.ServiceError;
}

describe("GrpcError", () => {
  it("should be an instance of Error", () => {
    const err = new GrpcError("users", "GetUser", makeServiceError(grpc.status.NOT_FOUND, "not found"));
    expect(err).to.be.instanceOf(Error);
    expect(err).to.be.instanceOf(GrpcError);
  });

  it("should expose the gRPC status code", () => {
    const err = new GrpcError("users", "GetUser", makeServiceError(grpc.status.NOT_FOUND, "not found"));
    expect(err.code).to.eq(grpc.status.NOT_FOUND);
  });

  it("should expose the error details", () => {
    const err = new GrpcError("users", "GetUser", makeServiceError(grpc.status.INVALID_ARGUMENT, "bad input"));
    expect(err.details).to.eq("bad input");
  });

  it("should include service, method, status name, and details in the message", () => {
    const err = new GrpcError("users", "CreateUser", makeServiceError(grpc.status.ALREADY_EXISTS, "email taken"));
    expect(err.message).to.include("users/CreateUser");
    expect(err.message).to.include("ALREADY_EXISTS");
    expect(err.message).to.include("email taken");
  });
});
