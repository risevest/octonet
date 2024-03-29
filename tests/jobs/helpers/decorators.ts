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

export const GROUP_NAME = "test-jobs";

@cron(GROUP_NAME)
export class CronGroup {
  public counter = 0;

  @daily("normal", { retries: 2, timeout: "5s" })
  async normalJob() {
    normalSpy(this.counter);
  }

  @query("data")
  async generateData() {
    querySpy();
    return [1, 2, 3, 4];
  }

  @job("data", "0 23 * * *", { retries: 3, maxComputeTime: "5s" })
  async scheduledJob(num: number) {
    dataSpy(num);
  }

  @query("data_clone")
  async generateDataClone() {
    return [1, 2, 3, 4];
  }

  @job("data_clone", "0 23 * * *", { retries: 3, maxComputeTime: "5s" })
  async scheduledCloneJob(_num: number) {}
}

@injectable()
export class NeedsCronGroup {
  @inject(GroupTag) public cron: CronGroup;
}
