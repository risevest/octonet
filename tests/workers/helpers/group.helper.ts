import { inject, injectable } from "inversify";
import { eventGroup, handler } from "../../../src";

export const GroupTag = Symbol.for("Group");
export const NeedsGroupTag = Symbol.for("NeedsGroup");

@eventGroup("group")
export class Group {
  @handler("handler")
  handleEvent() {}
}

@injectable()
export class NeedsGroup {
  @inject(GroupTag) group: Group;
}
