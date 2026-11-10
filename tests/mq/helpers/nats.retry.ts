import sinon from "sinon";

import { DeliveryInfo, RetryError, stream, subscribe } from "../../../src";

export const work = sinon.spy();

export interface Work {
  id: string;
  retry: boolean;
}

@stream("retries")
export class RetryConsumer {
  @subscribe("work")
  work(data: Work, info: DeliveryInfo) {
    work(data, info);
    if (data.retry) {
      throw new RetryError();
    }
  }
}
