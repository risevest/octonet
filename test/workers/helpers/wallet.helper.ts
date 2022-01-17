import { inject } from "inversify";
import sinon from "sinon";

import { eventGroup, handler } from "../../../src";

export const WalletStubTag = Symbol.for("WalletStub");

interface Withdrawal {
  amount: number;
  receiver: string;
}

export class WalletStub {
  fund(amount: number) {}
  withdraw(withdrawal: Withdrawal) {}
  close() {}
}

@eventGroup("wallet")
export class WalletConsumer {
  @inject(WalletStubTag) private spy: WalletStub;

  @handler("fund")
  fund(amount: number) {
    this.spy.fund(amount);
  }

  @handler("withdraw")
  withdraw(withdrawal: Withdrawal) {
    this.spy.withdraw(withdrawal);
  }
}

@eventGroup()
export class WalletGroupConsumer {
  @inject(WalletStubTag) private spy: WalletStub;

  @handler("close.group")
  close() {
    this.spy.close();
  }
}

export const Wallet = new WalletStub();
const fund = sinon.stub(Wallet, "fund");
const withdraw = sinon.stub(Wallet, "withdraw");
const close = sinon.stub(Wallet, "close");

export function mockFund(amount: number) {
  return fund.withArgs(amount);
}

export function mockWithdrawal(match: Partial<Withdrawal>) {
  return withdraw.withArgs(sinon.match(match));
}

export function mockClose() {
  return close.withArgs();
}
