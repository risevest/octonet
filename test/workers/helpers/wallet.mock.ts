import sinon from "sinon";
import { IWallet } from "./wallet.helper";

export class TestWalletFunder implements IWallet {
  fund() {
    throw new Error("fund method not implemented");
  }
}

export const testWallet = new TestWalletFunder();
export const mockFund = sinon.stub(testWallet, "fund");
