import { inject, injectable } from "inversify";
import sinon from "sinon";

import { cron, daily, job, query } from "../../../src";

export const GroupTag = Symbol("Group");
export const NeedsGroupTag = Symbol("NeedsGroup");
export const queryKey = Symbol.for("cron.job.query");
export const jobKey = Symbol.for("cron.job");
export const cronKey = Symbol.for("cron");

export const normalSpy = sinon.spy();
export const querySpy = sinon.spy();
export const dataSpy = sinon.spy();

@cron()
export class CronGroup {
  public counter = 0;

  @daily("normal")
  async normalJob() {
    normalSpy(this.counter);
  }

  @query("data")
  async generateData() {
    return [1, 2, 3, 4];
  }

  @job("data", "0 23 * * *")
  async scheduledJob(num: number) {
    dataSpy(num);
  }
}

@injectable()
export class NeedsCronGroup {
  @inject(GroupTag) public cron: CronGroup;
}
