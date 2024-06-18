# AMQP

The AMQP Module is used for interservice communication via message queues.
The AMQP module sends messages using the `amqp` protocol. One of the most popular providers of message queues using amqp protocol is `RabbitMQ` which is currently being used in octonet.
It sends messages(data) to a queue using a [channel](https://www.rabbitmq.com/channels.html).
The two decorators used for message queues in octonet are as follows:

- **jobs** [*@stream(**name**: string, ...groupMiddleware)*]: This decorator is annotated at the top of an event class (more on that later) to depict an event group. It's a way of grouping an event and its related handlers.

- **command** [_@subscribe(**queue**: string, ...middleware)_]: The handler decorator is annotated at the top of a handler function (contained in an event class). It is executed when a particular event is dispatched.

## Manager

The AMQP Connection Manager is used to connect to the AMQP queue, create channels for sending and receiving events and closing the connection.
The AMQP Manager in octnet has the following functions

- **connect(namespace**: _string_, **amqp_url**: _string_ **)**: Connecting to the amqp queue. It supports multiple connections and hence you can connect to different queues using different namespaces.
- **createChannel(namespace:** _string_ **)**: Creating a channel on the connection with specified namespace. Through this channel, events from the publisher can be sent to a worker.
- **close()**: closes all the ampq connection(s)
- **withChannel(name**: _string_, **runner**: _(chan: Channel) => Promise<void>_ **)**: Creates a channel, runs the runner function on that channel and closes that channel.

## Worker

The AMQP worker is used to listen on all the defined events (annotated with @eventgroup and @jobs). It has just one method

- **listen()**: Listens for messages on all queues on a channel.

## Queue

The AMQP worker is used to publish to a channel. It has one method

- **push(queue**:_string_, **data**:_any_ **)**: Pushes data to the queue via the channel.

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

### Step 3: Creating the `Wallet` class

Next, we create the `Wallet` class for handling the `fund` and `withdrawal` event. Note that the `Wallet` class is `injectable()` by default;

```js
// wallet.ts
import { job, command } from "@noxecane/octonet";
import { WALLET_TAG, container } from "./inversify.config";
import { IFundWallet} from "./wallet.interface";

@jobs('wallet')
export class Wallet {

    @inject(WALLET_TAG) private walletRepo: IFundWallet;

    //listens on queue = WALLET_FUND
    @command('wallet.fund')
    executeWalletFunding(amount: number): void {
        this.walletRepo.fund(amount);
    }

    //listens on queue = WALLET_WITHDRAW
    @command('wallet.withdraw')
    eexecuteWalletWithdrawal(amount): void {
        this.walletRepo.withdraw(amount);
    }
}
```

### Step 4: Creating a container class

Next, we create a container class for binding the necessary interfaces with their respective implementations.

```js
// inversify.config.ts

import { Container } from "inversify";
import { IFundWallet} from "./wallet.interface";
import { FundWallet } from "./wallet.repo";
import './wallet.ts'

export const WALLET_TAG = Symbol.for('Wallet');

const container = new Container();
container.bind<IFundWallet>(WALLET_TYPE).to(FundWallet);

export container;
```

**@command** takes a string input. That string is capitalized and all '.' are converted to '\_'. e,g `wallet.withdraw.user` becomes `WALLET_WITHDRAW_USER`

The manager listens on this queue.

### Step 5: Creating group middleware and handler middleware

A middleware is a function that receives data from the stream, does some processes and and returns the updated data which would be used by the next middleware or the final handler function.

We have 2 types of middleware

- **Handler middleware**: These functions run before the handler they are specified in. Then handler function will be run only after all middleware are run.
- **Group middleware:** These middle are common to all handlers in a class and will run before all the handler middleware.

The order in which the function are run are

```
groupMiddleware -> handlerMiddleware -> Handler
```

```js
// wallet.ts
import { jobs, command } from "@noxecane/octonet";
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

@jobs('wallet', groupMiddleware)
export class Wallet {

    @inject(WALLET_TAG) private walletRepo: IFundWallet;

    //listens on queue = WALLET_FUND
    @command('wallet.fund')
    executeWalletFunding(amount: number): void {
        this.walletRepo.fund(amount);
    }

    //listens on queue = WALLET_WITHDRAW
    @command('wallet.withdraw')
    eexecuteWalletWithdrawal(amount): void {
        this.walletRepo.withdraw(amount);
    }
}
```

### Step 6: Creating the Consumer instance

Finally, we create the consumer instance

```js
// index.ts

import { Logger, ConnectionManager, AMQPQueue, AMQPWorker, defaultSerializers } from "@noxecane/octonet";
import "./wallet.ts"; // needed for initialization of the Wallet event class
import { container } from "./invesify.config";
import { createQueue, Queue } from "./amqp.helper";

// RABBITMQ CONNECTION
const amqpURL = "amqp://localhost:5672";
let manager: ConnectionManager;
let logger: Logger;
let queue: AMQPQueue;
let worker: AMQPWorker;

// create a Logger instance
const logger = new Logger({
  name: "wallet_demo",
  serializers: defaultSerializers(),
  verbose: false
});

// immediately invoking function
(async function () {
  manager = new ConnectionManager(logger);
  worker = new AMQPWorker(container, logger);
  await manager.connect("namespace", amqpUrl);

  const channel = await manager.createChannel("namespace");
  worker.listen(channel);

  queue = new AMQPQueue(channel);

  // testing the `WALLET` class by pushing data(messages) to the various queues
  await queue.push("WALLET_FUND", 200);
  await queue.push("WALLET_WITHDRAW", 100);
})();
```
