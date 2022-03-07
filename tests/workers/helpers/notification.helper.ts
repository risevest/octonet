import sinon from "sinon";
import { eventGroup, handler } from "../../../src";

export const EVENT = "NOTIFICATIONS_SEND";

@eventGroup("notifications")
export class NotificationConsumer {
  constructor() {
    sinon.spy(this);
  }

  @handler("send")
  sendNotification() {
    return 2;
  }
}
