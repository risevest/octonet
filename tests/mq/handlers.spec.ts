import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";

import { Middleware, RetryError, collapse } from "../../src";

chai.use(chaiAsPromised);

const passThrough: Middleware = async (data, handler) => {
  await handler(data);
};

describe("collapse", () => {
  it("should propagate handler errors through multiple middleware", async () => {
    const handler = sinon.stub().rejects(new RetryError());
    const collapsed = collapse(handler, [passThrough, passThrough, passThrough]);

    await expect(collapsed("data")).to.be.rejectedWith(RetryError);
  });

  it("should pass delivery info to the handler past middleware", async () => {
    const handler = sinon.spy();
    const collapsed = collapse(handler, [passThrough, passThrough]);

    await collapsed("data", { attempt: 2, max_attempts: 5 });

    expect(handler.calledOnceWith("data", { attempt: 2, max_attempts: 5 })).to.be.true;
  });

  it("should pass delivery info to the handler without middleware", async () => {
    const handler = sinon.spy();
    const collapsed = collapse(handler, []);

    await collapsed("data", { attempt: 1, max_attempts: 3 });

    expect(handler.calledOnceWith("data", { attempt: 1, max_attempts: 3 })).to.be.true;
  });
});
