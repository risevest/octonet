import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

import path from "path";

const PROTO_PATH = path.join(__dirname, "test.proto");

const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const proto = grpc.loadPackageDefinition(packageDef) as any;

export interface EchoResponse {
  message: string;
  authorization: string;
  request_id: string;
  origin_service: string;
}

function echoHandler(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
  const meta = call.metadata;
  callback(null, {
    message: call.request.message,
    authorization: (meta.get("authorization")[0] as string) ?? "",
    request_id: (meta.get("x-request-id")[0] as string) ?? "",
    origin_service: (meta.get("x-origin-service")[0] as string) ?? ""
  });
}

function failHandler(_call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
  const err = Object.assign(new Error("intentional failure"), {
    code: grpc.status.INVALID_ARGUMENT,
    details: "intentional failure",
    metadata: new grpc.Metadata()
  }) as grpc.ServiceError;
  callback(err, null);
}

export function startGrpcServer(): Promise<[grpc.Server, number]> {
  return new Promise((resolve, reject) => {
    const server = new grpc.Server();
    server.addService(proto.test.TestService.service, { Echo: echoHandler, Fail: failHandler });
    server.bindAsync("0.0.0.0:0", grpc.ServerCredentials.createInsecure(), (err, port) => {
      if (err) return reject(err);
      resolve([server, port]);
    });
  });
}

export function stopGrpcServer(server: grpc.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.tryShutdown(err => {
      if (err) return reject(err);
      resolve();
    });
  });
}
