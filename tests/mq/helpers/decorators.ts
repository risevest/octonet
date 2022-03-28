import { inject, injectable } from "inversify";
import sinon from "sinon";

import { groupDecorator, handlerDecorator } from "../../../src";

export const groupKey = Symbol.for("group.key");
export const handlerKey = Symbol.for("handler.key");
export const GroupTag = Symbol.for("Group");
export const NeedsGroupTag = Symbol.for("NeedsGroup");

const gd = groupDecorator(groupKey);
const hd = handlerDecorator(handlerKey);

export const handlerSpy = sinon.spy();

@gd("group", middleware)
export class GroupClass {
  public counter = 0;

  @hd("handler", middleware)
  handleEvent() {
    handlerSpy(this.counter);
  }
}

@injectable()
export class NeedsGroupClass {
  @inject(GroupTag) public group: GroupClass;
}

export async function middleware(data: any, handler: Function) {
  await handler(data);
}
