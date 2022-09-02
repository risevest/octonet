import sinon from "sinon";

import { Middleware, command, jobs } from "../../../src";

type Spy = sinon.SinonSpy<any[], any>;
export const groupBefore = sinon.spy();
export const groupAfter = sinon.spy();
export const handlerBefore = sinon.spy();
export const handlerAfter = sinon.spy();
export const doSpy = sinon.spy();
export const customSpy = sinon.spy();

@jobs("group", middleware(groupBefore, groupAfter))
export class Worker {
  @command("do.job", middleware(handlerBefore, handlerAfter))
  do(data: string) {
    doSpy(data);
  }

  @command("CUSTOM_JOB")
  custom(data: string) {
    customSpy(data);
  }
}

export function middleware(before: Spy, after: Spy): Middleware {
  return async (data: any, handler: Function) => {
    before(data);
    await handler(data);
    after(data);
  };
}
