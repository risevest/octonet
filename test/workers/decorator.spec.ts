import { expect } from "chai";
import { Wallet } from "./helpers/wallet.helper";
import { eventGroupKey, eventHandlerKey } from "../../src/workers/constants";
import "reflect-metadata";

describe("Decorators", () => {
  it('should contain the "wallet" metadata on the Reflect group', () => {
    const eventGroupMetadata = Reflect.getMetadata(eventGroupKey, Reflect);

    expect(eventGroupMetadata.length).to.be.greaterThan(0);
    expect(eventGroupMetadata[0].prefix).to.equal("wallet");
  });

  it('should contain the "handler" metadata event', () => {
    const handlerMetadataGroup = Reflect.getMetadata(eventHandlerKey, Wallet);
    expect(handlerMetadataGroup.length).to.be.greaterThan(0);

    const fundMetadata = handlerMetadataGroup.pop();
    expect(fundMetadata.event).to.equal("fund");
    expect(fundMetadata.group).to.equal("Wallet");
  });
});
