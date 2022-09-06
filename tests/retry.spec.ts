import Bunyan from "bunyan";
import { expect } from "chai";
import faker from "faker";
import sinon from "sinon";

import { Logger } from "../src/logging/logger";
import { defaultSerializers } from "../src/logging/serializers";
import { ExitError, RetryError, retryOnError, retryOnRequest, retryTimeouts, wrapHandler } from "../src/retry";

describe("retryTimeouts", () => {
  it("should generate timeouts of exponential distance", () => {
    const timeout = faker.datatype.number({ min: 5, max: 30 });
    const timeouts = retryTimeouts(5, timeout);

    timeouts.forEach((t, i) => {
      const expectedT = timeout * Math.pow(2, i);
      expect(t).to.be.eq(expectedT);
    });
  });
});

describe("retryOnError", () => {
  it("should increment attempt number on each retry", async () => {
    let attempts: number[] = [];

    try {
      await retryOnError(2, "10ms", async attempt => {
        attempts.push(attempt);

        throw new Error("error");
      });
    } catch (error) {}

    expect(attempts).to.have.length(3);
    attempts.forEach((a, i) => {
      expect(a).to.eql(i + 1);
    });
  });

  it("should not retry when maxRetries is 0", async () => {
    let count = 0;

    try {
      await retryOnError(0, "10ms", async () => {
        ++count;

        throw new Error("error");
      });
    } catch (err) {}

    expect(count).to.eq(1);
  });

  it("should retry according to maxRetries", async () => {
    let count = 0;

    try {
      await retryOnError(4, "10ms", async () => {
        ++count;

        throw new Error("error");
      });
    } catch (err) {}

    expect(count).to.eq(5);
  });

  it("should exit when no error", async () => {
    let count = 0;

    try {
      await retryOnError(4, "10ms", async () => {
        ++count;

        if (count === 2) {
          return;
        }

        throw new Error("error");
      });
    } catch (err) {}

    expect(count).to.eq(2);
  });

  it("should exit early", async () => {
    let count = 0;

    try {
      await retryOnError(4, "10ms", async () => {
        ++count;

        if (count === 3) {
          throw new ExitError();
        }

        throw new Error("error");
      });
    } catch (err) {}

    expect(count).to.eq(3);
  });
});

describe("retryOnRequest", () => {
  it("should increment attempt number on each retry", async () => {
    let attempts: number[] = [];

    try {
      await retryOnRequest(5, "10ms", async attempt => {
        attempts.push(attempt);

        throw new RetryError();
      });
    } catch (error) {}

    expect(attempts).to.have.length(6);
    attempts.forEach((a, i) => {
      expect(a).to.eql(i + 1);
    });
  });

  it("should try only one attempt by default", async () => {
    let count = 0;

    try {
      await retryOnRequest(4, "10ms", async () => {
        ++count;

        throw new Error("error");
      });
    } catch (err) {}

    expect(count).to.eq(1);
  });

  it("should retry on RetryError", async () => {
    let count = 0;

    try {
      await retryOnRequest(4, "10ms", async () => {
        ++count;

        if (count === 3) {
          throw new Error();
        }

        throw new RetryError();
      });
    } catch (err) {}

    expect(count).to.eq(3);
  });
});

describe("wrapHandler", () => {
  const buffer = new Bunyan.RingBuffer({ limit: 5 });
  const logger = new Logger({ name: "wrapper", buffer: buffer, serializers: defaultSerializers() });

  afterEach(() => {
    buffer.records = [];
  });

  it("should log function calls", async () => {
    const f = sinon.spy();
    const fn = wrapHandler(logger, f);
    const arg1 = faker.datatype.number();
    const arg2 = faker.name.findName();

    await fn(arg1);
    await fn(arg2);

    expect(f.calledTwice).to.be.true;
    expect(f.calledWith(arg1)).to.be.true;
    expect(f.calledWith(arg2)).to.be.true;

    expect(buffer.records).to.have.length(2);

    const [call1, call2] = buffer.records;
    expect(call1.data).to.eq(arg1);
    expect(call2.data).to.eq(arg2);
  });

  it("should log faied function calls", async () => {
    const f = sinon.spy((_x: number) => {
      throw new Error("internal error");
    });
    const fn = wrapHandler(logger, f);
    const arg = faker.datatype.number();

    try {
      await fn(arg);
    } catch (err) {
      expect(err.message).to.eq("internal error");
    }

    expect(f.calledOnceWith(arg)).to.be.true;

    expect(buffer.records).to.have.length(2);

    const [, err] = buffer.records;
    expect(err.data).to.eq(arg);
    expect(err.err.name).to.eq("Error");
    expect(err.err.message).to.eq("internal error");
  });
});
