import { expect } from "chai";

import { ExitError, RetryError, retryOnError, retryOnRequest } from "../src/retry";

describe("retryOnError", () => {
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

      // we give an error of 5 extra ms
      expect(t).to.be.within(expectedT, expectedT + 5);
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

        throw new RetryError("error");
      });
    } catch (err) {}

    expect(count).to.eq(3);
  });
});
