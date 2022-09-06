import Bunyan from "bunyan";
import { expect } from "chai";
import faker from "faker";
import sinon from "sinon";

import { Logger } from "../src/logging/logger";
import { defaultSerializers } from "../src/logging/serializers";
import { ExitError, RetryError, retryOnError, retryOnRequest, wrapHandler } from "../src/retry";

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

  it("should space retries using exponential backoff", async () => {
    let timeouts: number[] = [];
    const inMillis = (time: number[]) => time[0] * 1000 + time[1] / 1000000;
    let now = process.hrtime();

    try {
      await retryOnError(2, "10ms", async () => {
        const temp = now;
        now = process.hrtime();
        timeouts.push(inMillis(now) - inMillis(temp));

        throw new Error("error");
      });
    } catch (error) {}

    expect(timeouts).to.have.length(3);
    timeouts.slice(1).forEach((t, i) => {
      const expectedT = 10 * Math.pow(2, i);

      // actual time is exp - 1 <= t <= exp + 5 due to the inaccuracy of
      // setTimeout and inconsistent execution times
      expect(t).to.be.within(expectedT - 1, expectedT + 5);
    });
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
