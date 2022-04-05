# Octonet

![Github Actions](https://github.com/risevest/octonet/actions/workflows/build-test.yml/badge.svg)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

## About

Octonet is an internal library (Rise) that provides utility functions for building microservices such as:

- Interservice communication (via REST)
- Subscribing to events from RabbitMQ queues.
- Authentication

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development purposes.

### Prerequisites

The following are required for the best use of Octonet:

- Package Dependencies
  - NodeJs (v14 or higher)
  - Yarn
  - Typescript (v4.4 or higher)
- A basic understanding of dependency injection with Inversify

### Installation

To install Octonet, run the following command in your terminal

```bash
yarn install --save @risemaxi/octonet reflect-metadata inversify
```

> Note: Octonet requires Typescript (>= v4.4), as well as the `Decorator` experimental feature. Therefore, the following config options should be present in your `tsconfig.json` file:

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["es2017", "esnext.asynciterable", "dom"],
    "types": ["reflect-metadata"],
    "module": "commonjs",
    "moduleResolution": "node",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

## Guides

Below are links to detailed explanations to the various features of Octonet as well as practical examples:

- [HTTP (Interservice Comunication)](docs/HTTP.md)
- [Consumer (subscribing to events)](docs/Consumer.md)
- [Authentication](docs/Authentication.md)
- [Logging](docs/Logging.md)

## References and Helpful Links

The following links would further aid the understanding of Octonet

- [Inversify](https://github.com/inversify/InversifyJS#readme)
- [Reflect Metadata](https://rbuckton.github.io/reflect-metadata/)
- [Typescript Decorators](https://www.typescriptlang.org/docs/handbook/decorators.html)
- [AMPQ Client docs for NodeJs](http://www.squaremobius.net/amqp.node/channel_api.html)
- [Bunyan](https://github.com/trentm/node-bunyan#readme)
- [Axios](https://axios-http.com/docs/intro)
