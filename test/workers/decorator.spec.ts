import { expect } from "chai";
import { Wallet } from "./helpers/decorator.helper";
import { eventGroupKey, eventHandlerKey } from "../../src/workers/constants";

describe('Decorators', () => {
    it('should contain the "wallet" metadata on the Reflect group', () => {
        // @ts-ignore
        const testWallet: Wallet = new Wallet();
        const eventGroupMetadata = Reflect.getMetadata(eventGroupKey, Reflect);

        expect(eventGroupMetadata.length).to.be.greaterThan(0);
        expect(eventGroupMetadata[0].prefix).to.equal('wallet');
    });

    it('should contain the "handler" metadata event', () => {
        const testWallet: Wallet = new Wallet();
        testWallet.fund(50);

        const handlerMetadataGroup = Reflect.getMetadata(eventHandlerKey, Wallet);
        expect(handlerMetadataGroup.length).to.be.greaterThan(0);

        const fundMetadata = handlerMetadataGroup.pop();
        expect(fundMetadata.event).to.equal('fund');
        expect(fundMetadata.group).to.equal('Wallet');
    });
});