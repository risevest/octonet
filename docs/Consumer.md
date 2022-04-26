# Consumer

This describes the NatsConsumer API.

## Decorators

NATS is a **pub-sub** system and it works using the [Subject messaging system](https://docs.nats.io/nats-concepts/subjects). It consists of **publishers** and **subscribers**. Subscribers listen for data on a specific **subject**. In our case a group of related subscribers are called **streams**.

The following decorators are used for NATS in Octonet:

- **stream** [*@stream(**name**: string, ...groupMiddleware)*]: This decorator is annotated at the top of an event class (more on that later) to depict a stream. It's a way of grouping an subject and its related subscribers.

- **subscribe** [_@subscribe(**subject**: string, ...middleware)_]: The subscriber decorator is annotated at the top of a subscriber function (contained in a stream class). It is executed when data is pushed to a particular subject is dispatched.

## Consumer

The Octonet Consumer is used to listen for events dispatched from different subjects on the **NATS server**. These events are then handled by event classes containing handler functions.

## Basic example

Let's look at a practical application of decorators, an event class and a consumer class. Basically, our goal is to have a `Wallet` event class which handles two wallet-related events namely: `fund` and `withdrawal`.

### Step 1: Creating types and interface

First, we create types and interfaces. The interface is an abstraction which is responsible for the core functionality for the `Wallet` class.

Theses interfaces will contain methods necessary for the functionality of the `executeFunding` and `executeWithdrawal` methods in our `Wallet` class.

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
import { stream, subscribe } from "@risemaxi/octonet";
import { WALLET_TAG, container } from "./inversify.config";
import { IFundWallet} from "./wallet.interface";

@stream('wallet')
export class Wallet {

    @inject(WALLET_TAG) private walletRepo: IFundWallet;

    //listens on subject = wallet.fund
    @subscribe('fund')
    executeWalletFunding(amount: number): void {
        this.walletRepo.fund(amount);
    }

    //listens on subject = wallet.withdraw
    @subscribe('withdraw')
    eexecuteWalletWithdrawal(amount): void {
        this.walletRepo.withdraw(amount);
    }
}
```

The handler listens on subject = `streamName.consumerSubject`

### Step 5: Creating stream middleware and consumer middleware

A middleware is a function that receives data from the stream, does some processes and and returns the updated data which would be used by the next middleware or the final handler function.

We have 2 types of middleware

- **consumer middleware**: These functions run before the handler they are specified in. Then consumer function will be run only after all stream middleware are run.
- **stream middleware:** These functions are common to all handlers in a class and will run before all the handler middleware.

The order in which the function are run are

```
groupMiddleware -> handlerMiddleware -> handler
```

```js
// wallet.ts
import { stream, subscribe } from "@risemaxi/octonet";
import { WALLET_TAG, container } from "./inversify.config";
import { IFundWallet} from "./wallet.interface";

function groupMiddleware(amount: number){
  console.log(`fund stream processing ${amount} dollars`)
  return amount;
}

function walletFundingMiddleware(amount: number){
  console.log(`withdrawing ${amount} dollars`)
  return amount;
}

@stream('wallet', groupMiddleware)
export class Wallet {

    @inject(WALLET_TAG) private walletRepo: IFundWallet;

    @subscribe('fund') //listens on subject = wallet.fund
    executeWalletFunding(amount: number): void {
        this.walletRepo.fund(amount);
    }

    //listens on subject = wallet.withdraw
    @subscribe('withdraw', walletFundingMiddleware)
    eexecuteWalletWithdrawal(amount): void {
        this.walletRepo.withdraw(amount);
    }
}
```

### Step 6: Creating the Consumer instance

Finally, we create the consumer instance

```js
// index.ts

import { Logger, NatsConsumer, NatsPublisher, publisherFactory, defaultSerializers } from "@risemaxi/octonet";
import "./wallet.ts"; // needed for initialization of the Wallet event class
import { container } from "./invesify.config";
import { createQueue, Queue } from "./amqp.helper";

// NATS URL
const natsUrl = "demo.nats.io:4443";
let consumer: NatsConsumer;
let logger: Logger;
let publisher: NatsPublisher;

// create a Logger instance
const logger = new Logger({
  name: "wallet_demo",
  serializers: defaultSerializers(),
  verbose: false
});

// immediately invoking function
(async function () {
  consumer = new Consumer(container, logger);
  const natsConnection = await connect(natsUrl);
  consumer.listen(nats, {
    namespace: "wallets-namespace",
    batch_size: 10,
    timeout: "1m"
  });

  publisher = await publisherFactory(natsConnection);

  // testing the `WALLET` class
  await publisher.publish("wallet.func", 200);
  await publisher.publish("wallet.withdraw", 100);
})();
```
