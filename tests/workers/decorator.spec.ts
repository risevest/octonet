import "reflect-metadata";

import { expect } from "chai";
import { Container } from "inversify";

import { eventGroupKey, eventHandlerKey } from "../../src/workers/constants";
import { Group, GroupTag, NeedsGroup, NeedsGroupTag } from "./helpers/group.helper";

describe("Decorators#eventGroup", () => {
  it("should save group as an event group", () => {
    const eventGroupMetadata = Reflect.getMetadata(eventGroupKey, Reflect);

    // we do this because mocha loads all sources
    expect(eventGroupMetadata.length).to.be.greaterThanOrEqual(1);
    const [eventGroup] = eventGroupMetadata;

    expect(eventGroup.prefix).to.equal("group");
    expect(eventGroup.constructor).to.be.a("function");
  });

  it("should make the class injectable", () => {
    const container = new Container();
    container.bind<Group>(GroupTag).to(Group);
    container.bind<NeedsGroup>(NeedsGroupTag).to(NeedsGroup);

    const needsGroupInstance = container.get<NeedsGroup>(NeedsGroupTag);
    expect(needsGroupInstance.group).to.be.instanceOf(Group);
  });
});

describe("Decorators#handler", () => {
  it('should contain the "handler" metadata event', () => {
    const handlerMetadataGroup = Reflect.getMetadata(eventHandlerKey, Group);

    // we do this because mocha loads all sources
    expect(handlerMetadataGroup.length).to.be.greaterThanOrEqual(1);
    const [eventHandler] = handlerMetadataGroup;

    expect(eventHandler.event).to.eq("handler");
    expect(eventHandler.group).to.eq(Group.name);
    expect(eventHandler.method).to.eq("handleEvent");
  });
});
