import { startServer, stopServer, TestResponse } from "../server";
import { Server } from "http";
import { InternetService } from "../../src/net/internet";
import { expect } from "chai";
import { Logger, defaultSerializers, createRequestSerializer } from "../../src/logging";
import Bunyan from "bunyan";

let server: Server;

before(async () => {
  server = (await startServer(4050)) as Server;
});

after(async () => {
  await stopServer(server);
});

const ringbuffer = new Bunyan.RingBuffer({ limit: 5 });

const logger = new Logger({
  name: "logger_tests",
  buffer: ringbuffer,
  serializers: defaultSerializers({ http_req: createRequestSerializer("admin.password") }, "password")
});

const httpClient = new InternetService(200, logger);
const mockServerUrl = `http://localhost:${4050}`;

describe("HttpClient#Get", () => {});
