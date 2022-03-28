import "reflect-metadata";

import { expect } from "chai";
import { Container } from "inversify";
import sinon from "sinon";

import { Group, Handler, parseHandlers } from "../../src/mq/decorators";
import {
  GroupClass,
  GroupTag,
  NeedsGroupClass,
  NeedsGroupTag,
  groupKey,
  handlerKey,
  handlerSpy
} from "./helpers/decorators";

afterEach(() => {
  sinon.resetHistory();
});

describe("Decorators#groupDecorator", () => {
  it("should save group as an event group", () => {
    const groups: Group[] = Reflect.getMetadata(groupKey, Reflect);

    expect(groups).to.have.length(1);
    const [group] = groups;

    expect(group.tag).to.eq("group");
    expect(group.constructor).to.be.a("function");
    expect(group.middleware).to.have.length(1);
  });

  it("should make the class injectable", () => {
    const container = new Container();
    container.bind<GroupClass>(GroupTag).to(GroupClass);
    container.bind<NeedsGroupClass>(NeedsGroupTag).to(NeedsGroupClass);

    const needsGroupInstance = container.get<NeedsGroupClass>(NeedsGroupTag);
    expect(needsGroupInstance.group).to.be.instanceOf(GroupClass);
  });
});

describe("Decorators#handlerDecorator", () => {
  it('should contain the "handler" metadata event', () => {
    const handlers: Handler[] = Reflect.getMetadata(handlerKey, GroupClass);

    // we do this because mocha loads all sources
    expect(handlers.length).to.be.greaterThanOrEqual(1);
    const [handler] = handlers;

    expect(handler.tag).to.eq("handler");
    expect(handler.class_name).to.eq(GroupClass.name);
    expect(handler.method).to.eq("handleEvent");
    expect(handler.middleware).to.have.length(1);
  });
});

describe("Decorators#parseHandlers", () => {
  it("should merge group and handler information to one", () => {
    const container = new Container();
    const handlers = parseHandlers(container, groupKey, handlerKey);

    expect(handlers).to.have.length(1);
    const [handler] = handlers;

    expect(handler.group_tag).to.eq("group");
    expect(handler.handler_tag).to.eq("handler");
    expect(handler.group_middleware).to.have.length(1);
    expect(handler.handler_middleware).to.have.length(1);
  });

  it("should ensure the handler still acts like a method", () => {
    const container = new Container();
    const handlers = parseHandlers(container, groupKey, handlerKey);
    const [handler] = handlers;

    handler.handler();
    expect(handlerSpy.called).to.be.true;
    expect(handlerSpy.firstCall.firstArg).to.eq(0);
  });
});
