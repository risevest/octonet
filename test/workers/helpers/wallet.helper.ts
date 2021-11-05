import { inject } from "inversify";
import { eventGroup, handler } from "../../../src/workers/decorators";

export const TYPES = {
  Wallet: Symbol.for("Wallet")
};

export interface IWallet {
  fund(): void;
}

export class WalletFunder implements IWallet {
  fund() {
    console.log("Wallet funded!");
  }
}

@eventGroup("wallet")
export class Wallet {
  @inject(TYPES.Wallet) private walletFunder: IWallet;

  @handler("fund")
  executeFunding() {
    this.walletFunder.fund();
  }
}
