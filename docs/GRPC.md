# gRPC (Interservice communication)

This section describes the gRPC module of Octonet and how to use it for interservice communication.

## About

The gRPC module provides a type-safe, fluent client for making [gRPC](https://grpc.io/) calls between services. It is designed as a drop-in companion to the HTTP module — both share the same auth, tracing, and builder patterns so switching between them is straightforward.

Use the gRPC module when:

- You need lower latency and smaller payloads than REST for high-frequency interservice calls
- You want a strict, schema-first contract between services via `.proto` files
- You are migrating an existing HTTP interservice client to gRPC

## Prerequisites

Install the required peer dependencies alongside Octonet:

```bash
yarn add @grpc/grpc-js @grpc/proto-loader
```

You will also need a `.proto` file that defines the service contract. Both the calling service and the receiving service must use the same file.

---

## GrpcAgent

`GrpcAgent` is the entry point for all gRPC calls. It is analogous to `HttpAgent` — configure it once with your service's auth details and bind it to your DI container. A single instance can call any number of downstream gRPC services.

### Constructor

```ts
new GrpcAgent(config: AgentConfig)
```

#### Parameters

| Field | Type | Description |
|---|---|---|
| `service` | `string` | Name of the calling service |
| `scheme` | `string` | Auth token scheme, e.g. `"Rise"` |
| `secret` | `string` | Secret used to sign system JWTs |
| `timeout` | `string` | JWT expiry for system tokens. Defaults to `"10s"` |

#### Stub caching

`GrpcAgent` creates gRPC stubs (channels) lazily — the first call to a given `(address, protoPath, service)` combination loads the proto file and opens the channel. Every subsequent call to the same target reuses the cached stub, so the overhead is paid at most once per unique connection target.

### `call(method, payload)`

Prepares a gRPC call and returns a `GrpcRequestWrapper` for attaching connection info, auth, and tracing before executing.

```ts
agent.call(method: string, payload: object): GrpcRequestWrapper
```

#### Parameters

- **method** — RPC method name as defined in the proto service, e.g. `"GetUser"`
- **payload** — Request message matching the proto message type

---

## GrpcRequestWrapper

`GrpcRequestWrapper` is a fluent builder returned by `agent.call()`. Chain methods to configure the call, then execute it with `.do()`.

### `.via(address, protoPath, service, credentials?)`

Specifies the target gRPC server. **Required** — must be called before `.do()`.

```ts
.via(
  address: string,           // host:port, e.g. "users-service:50051"
  protoPath: string,         // absolute path to the .proto file
  service: string,           // fully qualified service name, e.g. "users.UserService"
  credentials?: ChannelCredentials  // defaults to insecure (suitable for in-cluster traffic)
): this
```

### `.auth(reqOrSession?)`

Attaches an authorization token to the call metadata. Supports three modes:

| Call | Behaviour |
|---|---|
| `.auth(req)` | Forwards the `Authorization` header from an Express request |
| `.auth(session)` | Generates a signed system JWT containing the given session payload |
| `.auth()` | Generates a signed system JWT scoped to the calling service |

### `.track(req?)`

Enables distributed tracing on the call.

| Call | Behaviour |
|---|---|
| `.track(req)` | Forwards `x-request-id` from an Express request |
| `.track()` | Generates a new UUID as `x-request-id` |

In both cases, `x-origin-service` is set to the calling service name.

### `.set(key, value)`

Sets an arbitrary metadata key/value pair on the call.

```ts
.set(key: string, value: string): this
```

### `.do(deadline?)`

Executes the RPC call. Always the final method in the chain.

```ts
.do<TResponse = any>(deadline?: number): Promise<TResponse>
```

- **deadline** — timeout in seconds. Defaults to `30`.
- Rejects with `GrpcError` if the server returns a non-OK status or the deadline is exceeded.

---

## GrpcError

`GrpcError` is thrown whenever a gRPC call returns a non-OK status. It is analogous to `APIError` in the HTTP module.

| Property | Type | Description |
|---|---|---|
| `message` | `string` | Human-readable summary including service, method, status name, and details |
| `code` | `grpc.status` | Numeric gRPC status code |
| `details` | `string` | Error detail string from the server |

Common gRPC status codes:

| Code | Name | Typical cause |
|---|---|---|
| `1` | `CANCELLED` | Call cancelled by the client |
| `4` | `DEADLINE_EXCEEDED` | Call did not complete before the deadline |
| `5` | `NOT_FOUND` | Requested resource does not exist |
| `7` | `PERMISSION_DENIED` | Caller is not authorised |
| `13` | `INTERNAL` | Unhandled error on the server |
| `14` | `UNAVAILABLE` | Server is down or unreachable |

---

## Practical example

### Step 1: define the proto contract

Create a `.proto` file that describes the service. Both the client and server must use the same file.

```proto
// src/core/users/user.proto

syntax = "proto3";
package users;

service UserService {
  rpc GetUser (GetUserRequest) returns (UserResponse);
}

message GetUserRequest {
  string id = 1;
}

message UserResponse {
  string id          = 1;
  string first_name  = 2;
  string last_name   = 3;
  string email       = 4;
}
```

### Step 2: add the gRPC URL to your env config

```ts
// src/config/env.ts

export interface Env {
  service_name: string;
  auth_scheme: string;
  service_secret: string;
  users_grpc_url: string; // e.g. "users-service:50051"
}
```

### Step 3: bind GrpcAgent to your DI container

Bind a single `GrpcAgent` instance so it is shared — and its stub cache is shared — across all clients in the service.

```ts
// src/config/container.ts

import { Container } from "inversify";
import { GrpcAgent } from "@risemaxi/octonet";
import { TYPES } from "./types";
import { env } from "./env";

const container = new Container();

container
  .bind<GrpcAgent>(TYPES.GrpcAgent)
  .toConstantValue(
    new GrpcAgent({
      service: env.service_name,
      scheme: env.auth_scheme,
      secret: env.service_secret,
    })
  );

export { container };
```

### Step 4: use the agent in a client class

```ts
// src/core/users/user.grpc-client.ts

import path from "path";
import { inject, injectable } from "inversify";
import { GrpcAgent, GrpcError } from "@risemaxi/octonet";
import { Request } from "express";
import { TYPES } from "../../config/types";
import { env } from "../../config/env";

const PROTO_PATH = path.join(__dirname, "user.proto");

interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

@injectable()
export class UserGrpcClient {
  constructor(@inject(TYPES.GrpcAgent) private readonly agent: GrpcAgent) {}

  getUser(id: string, req: Request): Promise<User> {
    return this.agent
      .call("GetUser", { id })
      .via(env.users_grpc_url, PROTO_PATH, "users.UserService")
      .auth(req)
      .track(req)
      .do<User>(60);
  }
}
```

### Step 5: handle errors

```ts
import { GrpcError } from "@risemaxi/octonet";
import * as grpc from "@grpc/grpc-js";

try {
  const user = await userGrpcClient.getUser(id, req);
} catch (error) {
  if (error instanceof GrpcError) {
    switch (error.code) {
      case grpc.status.NOT_FOUND:
        // resource does not exist on the server
        throw new NotFoundError(`User ${id} not found`);

      case grpc.status.DEADLINE_EXCEEDED:
        // call timed out
        throw new TimeoutError(`users/GetUser timed out`);

      case grpc.status.UNAVAILABLE:
        // server is down or unreachable
        throw new ServiceUnavailableError("Users service is unavailable");

      default:
        throw error;
    }
  }

  throw error;
}
```

---

## Making headless (system-to-system) calls

When a call is not initiated by a user request — for example inside a background job — omit the Express request from `.auth()` and `.track()`. Octonet will generate a system JWT scoped to the calling service and a fresh trace ID automatically.

```ts
// inside a background job or event handler
const user = await this.agent
  .call("GetUser", { id })
  .via(env.users_grpc_url, PROTO_PATH, "users.UserService")
  .auth()    // generates system JWT — no Express request needed
  .track()   // generates a fresh x-request-id
  .do<User>(60);
```

---

## Copying proto files at build time

Proto files live in `src/` alongside your TypeScript source but must also be present in `dist/` at runtime. Add the following `rsync` command to your build script so all `.proto` files are copied automatically — including any new ones added in the future.

```json
// package.json
{
  "scripts": {
    "build": "tsc -p ./tsconfig.json && rsync -a --include='*.proto' --include='*/' --exclude='*' src/ dist/"
  }
}
```

---

## References

- [gRPC concepts](https://grpc.io/docs/what-is-grpc/core-concepts/)
- [Protocol Buffers language guide](https://protobuf.dev/programming-guides/proto3/)
- [@grpc/grpc-js](https://github.com/grpc/grpc-node/tree/master/packages/grpc-js)
- [@grpc/proto-loader](https://github.com/grpc/grpc-node/tree/master/packages/proto-loader)
