import { JetStreamClient } from "nats";

export function createNatsClient(url: string) {}

export class NatsService {
  constructor(private jetstreamClient: JetStreamClient) {}

  async publish(message: any) {}
}
