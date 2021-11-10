# Decorators & Consumer

This describes the Decorator and Consumer API

## Decorators

Decorators (in this context) are functions used to retrieve and store metadata about consumer classes. The two decorators used in Octonet are as follows:

- **eventGroup** [*@eventGroup(name: string)*]: This decorator is annotated at the top of a Consumer class (more on that later) to depict an event group. It's a way of grouping an event and its related handlers. It is used as follows:

- **handler** [_@handler(event: string)_]: The handler decorator is annotated at the top of a handler function. A handler function is a function that is executed when a particular event is dispatched.

## Consumer

The Octonet Consumer is used to listen for events dispatched from the [Manator API](https://github.com/risevest/manator-api). These events are then handled by event classes containing handler functions.

## Basic example

Let's look at a practical application of decorators and the consumer class. Basically, our goal is to have a `Wallet` class which handles two wallet-related events namely: `fund` and `withdrawal`.

### Step 1: Creating types and interface

First, we create types and interfaces. Theses interfaces will contain methods necessary for the functionality of the `fund` and `withdrawal` methods in our `Wallet` class.

Let's create our interface.

```js
// wallet.interface.ts

export interface IFundWallet {
  fund(amount: number): void;
  withdraw(amount: number): void;
}
```

### Step 2: Creating implementations of the interface

Next, we create an implementation of the `IFundWallet` interface, which will be bounded to it. This will be help Inversify during the dependency injection process at runtime.

```js
// wallet.repo.ts

import { IFundWallet } from "./wallet.interface";

export FundWallet implements IWallet{
    fund(amount: number){
        console.log(`Your wallet has been funded with $${amount}!`);
    }

    wallet(amount: number){
        console.log(`$${amount} was just withdrawn from your wallet!`);
    }
}
```

### Step 3: Creating a container class

Next, we create a container class for binding the necessary interfaces with their respective implementations.

```js
// inversify.config.ts

import { Container } from "inversify";
import { IFundWallet} from "./wallet.interface";
import { FundWallet } from "./wallet.repo";

export const WALLET_TAG = Symbol.for('Wallet');

const container = new Container();
container.bind<IFundWallet>(WALLET_TYPE).to(FundWallet);

export container;
```

### Step 4: Creating the `Wallet` class

Next, we create the `Wallet` class for handling the `fund` and `withdrawal` event. Note that the `Wallet` class is `injectable()` by default;

```js
// wallet.ts
import { eventGroup, handler } from "@risevest/octonet";
import { WALLET_TAG, container } from "./inversify.config";
import { IFundWallet} from "./wallet.interface";

@eventGroup('wallet')
export class Wallet {

    @inject(WALLET_TAG) private walletRepo: IFundWallet;

    @handler('fund')
    executeWalletFunding(amount: number): void {
        this.walletRepo.fund(amount);
    }

    @handler('withdraw')
    eexecuteWalletWithdrawal(amount): void {
        this.walletRepo.withdraw(amount);
    }
}
```

### Step 5: Creating helper functions for testing consumer

Let's create a helper file for testing the consumer;

```js
// amqp.helper.ts

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
```

### Step 6: Creating the Consumer instance

Finally, we create the consumer instance

```js
// index.ts

import { Logger, Consumer, defaultSerializers } from "@risevest/octonet";
import amqp from "amqplib";
import { container } from "./invesify.config";
import { createQueue, Queue } from "./amqp.helper";

// RabbitMQ URL
const amqpURL = "amqp://localhost:5672";
const consumer: Consumer;
const logger: Logger;
const queue: Queue;

// create a Logger instance
const logger = new Logger({
    name: "wallet_demo",
    serializers: defaultSerializers(),
    verbose: false
});

// immediately invoking function
(async function(){
    consumer = new Consumer(container, logger);
    consumer.listen(await amqp.connect(amqpURL));

    queue = await createQueue("amqp://localhost:5672");

    // testing the `WALLET` class
    await queue.push('WALLET_FUND', 200);
    await queue.push('WALLET_WITHDRAW', 100);
})();



```

**Interpretation:**

- When the project is executed at runtime, event-related metadata are created on the `Reflect` object courtesy of the `@eventGroup` and `@handler` decorators.
- ,
- Once the consumer instance has been created, the constructor creates a list of events using the event-related metadata previously stored on the `Reflect` object. Hence, two events namely `wallet.fund` and `wallet.withdraw` are created.
- The `listen` method creates queues from the list of events being maintained by the `Consumer` class.
- In this case, the queues created are: `WALLET_FUND` and `WALLET_WITHDRAW` queues.
- For testing, once a payload (amount) has been passed to either the `WALLET_FUND` or `WALLET_WITHDRAW` event, the `executeWalletFunding()` or `executeWalletWithdrawal()` function respectively is called in the `Wallet` class.
