import amqp, { Channel, Connection } from "amqplib";

export class Queue {
  private queues = new Set<string>();
  constructor(private conn: Connection, private chan: Channel) {}

  async push(queue: string, data: any) {
    this.queues.add(queue);
    await this.chan.assertQueue(queue, { durable: true });
    return this.chan.sendToQueue(queue, Buffer.from(JSON.stringify(data)));
  }

  async stop() {
    // clean up queues
    const queues = [...this.queues];
    for (const q of queues) {
      await this.chan.deleteQueue(q);
    }

    await this.chan.close();
    await this.conn.close();
  }
}

export async function createQueue(ampqURl: string) {
  const conn = await amqp.connect(ampqURl);
  const chan = await conn.createChannel();
  return new Queue(conn, chan);
}
