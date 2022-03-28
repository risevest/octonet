import sinon from "sinon";

import { Middleware, stream, subscribe } from "../../../src";

type Spy = sinon.SinonSpy<any[], any>;
export const groupBefore = sinon.spy();
export const groupAfter = sinon.spy();
export const handlerBefore = sinon.spy();
export const handlerAfter = sinon.spy();
export const debitWallet = sinon.spy();
export const creditWallet = sinon.spy();
export const allCredits = sinon.spy();

@stream("transactions", middleware(groupBefore, groupAfter))
export class Consumer {
  @subscribe("credit.wallet.*", middleware(handlerBefore, handlerAfter))
  debitWallet(data: any) {
    debitWallet(data);
  }

  @subscribe("credit.*.wallet")
  creditWallet(data: any) {
    creditWallet(data);
  }

  @subscribe("credit.>")
  allCredits(data: any) {
    allCredits(data);
  }
}

export function middleware(before: Spy, after: Spy): Middleware {
  return async (data: any, handler: Function) => {
    before(data);
    await handler(data);
    after(data);
  };
}
