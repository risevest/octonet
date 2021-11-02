import { Logger } from "../../src/logging";
import nock from "nock";
import { expect } from "chai";
import axios from "axios";

const logger = new Logger("test", "dev", {});
const interceptUrl = "https://api.github.com/repos/atom/atom/license";
const errorInterceptUrl = "http://www.google.com/cat-poems";

//to test successful requests
nock("https://api.github.com")
  .get("/repos/atom/atom/license")
  .times(2)
  .reply(200, {
    license: {
      key: "mit",
      name: "MIT License",
      spdx_id: "MIT",
      url: "https://api.github.com/licenses/mit",
      node_id: "MDc6TGljZW5zZTEz"
    }
  });

//to test requests that throw an error
nock("http://www.google.com").get("/cat-poems").replyWithError("something awful happened");

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

  it("returns the correct object", () => {
    logger.log("hello world");
    const keys = Object.keys(JSON.parse(logger.ringbuffer.records[0]));

    const success = keys.every(function (val) {
      return ["name", "hostname", "pid", "level", "msg", "time", "v"].indexOf(val) !== -1;
    });

    expect(success).to.be.true;
  });
});

describe("Bunyan#Error", () => {
  it("should log the correct error message", () => {
    logger.error("this is an internal application error");

    const errorObject = JSON.parse(logger.ringbuffer.records[0]);

    expect(logger.ringbuffer.records).to.be.length(1);
    expect(errorObject.msg).to.be.equal("this is an internal application error");
  });
});

describe("Bunyan#Request", () => {
  it("should be able to log a request", async () => {
    logger.request(await axios.get(interceptUrl));

    const keys = Object.keys(JSON.parse(logger.ringbuffer.records[0]));

    const success = ["name", "hostname", "pid", "level", "msg", "time", "v", "req"].every(function (val) {
      return keys.indexOf(val) !== -1;
    });

    const log = JSON.parse(logger.ringbuffer.records[0]);

    expect(success).to.be.true;
    expect(log.req.status).to.equal(200);
    expect(log.req.config.url).to.equal(interceptUrl);
    expect(logger.ringbuffer.records).to.be.length(1);
  });
});

describe("Bunyan#Response", () => {
  it("should be able to log a response", async () => {
    const data = await axios.get(interceptUrl);

    logger.response(data.request, data.data);

    const keys = Object.keys(JSON.parse(logger.ringbuffer.records[0]));

    const success = ["name", "hostname", "pid", "level", "msg", "time", "v", "req", "res"].every(function (val) {
      return keys.indexOf(val) !== -1;
    });

    expect(success).to.be.true;
    expect(logger.ringbuffer.records).to.be.length(1);
  });
});

describe("Bunyan#httpError", () => {
  it("should be able to log a http error", async () => {
    try {
      await axios.get(errorInterceptUrl);
    } catch (error) {
      logger.httpError(error, error.request, error.response);

      const keys = Object.keys(JSON.parse(logger.ringbuffer.records[0]));

      const success = ["name", "hostname", "pid", "level", "msg", "time", "v", "req", "err"].every(function (val) {
        return keys.indexOf(val) !== -1;
      });

      const log = JSON.parse(logger.ringbuffer.records[0]);

      expect(success).to.be.true;
      expect(log.err.message).to.be.equal("something awful happened");
      expect(log.err.config.url).to.be.equal(errorInterceptUrl);
    }
  });
});
