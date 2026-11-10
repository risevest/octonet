import sinon from "sinon";

import { DeliveryInfo, RetryError, command, worker } from "../../../src";

export const workSpy = sinon.spy();

export interface Work {
  id: string;
  retry: boolean;
}

@worker("retries")
export class RetryWorker {
  @command("work.job")
  work(data: Work, info: DeliveryInfo) {
    workSpy(data, info);
    if (data.retry) {
      throw new RetryError();
    }
  }
}
