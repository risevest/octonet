import { Logger } from "../../src/logging";
import { expect } from "chai";

const logger = new Logger("test", "dev", {});

// clears the buffer after each test
afterEach(() => {
  logger.ringbuffer.records = [];
});

describe("Bunyan#Log", () => {
  it("should be able to log and write multiple messages to buffer", () => {
    logger.log("hello world");
    logger.log("hello world");

    expect(logger.ringbuffer.records).to.be.length(2);
  });

  it("should log the correct error message", () => {
    logger.error("this is an internal application error");

    const errorObject = JSON.parse(logger.ringbuffer.records[0]);

    expect(logger.ringbuffer.records).to.be.length(1);
    expect(errorObject.msg).to.be.equal("this is an internal application error");
  });

  it("returns the correct object", () => {
    logger.log("hello world");
    const keys = Object.keys(JSON.parse(logger.ringbuffer.records[0]));

    const success = keys.every(function (val) {
      return ["name", "hostname", "pid", "level", "msg", "time", "v"].indexOf(val) !== -1;
    });

    expect(success).to.be.true;
  });
});
