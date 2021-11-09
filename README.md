# Octonet

![Github Actions](https://github.com/risevest/octonet/actions/workflows/build-test.yml/badge.svg)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

## About

Octonet is an internal library (Rise) that provides utility functions for building microservices such as:

- Interservice communication (via REST)
- Subscribing to events from [Manator API](https://github.com/risevest/manator-api)
- Authentication

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development purposes.

### Prerequisites

The following are required for Octonet to work properly:

- NodeJs (v14 or higher)
- NPM/Yarn
- Typescript (v4.4 or higher)

### Installation

To install Octonet, run the following command in your terminal

```bash
npm install --save @risevest/octonet reflect-metadata
```

> Note: Octonet requires Typescript(version listed above), as well as the `Decorator` experimental feature. Therefore, the following config options should be present in your `tsconfig.json` file:

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

## Features and API reference

The features Octonet provides are listed below:

- HTTP (Interservice Comunication)
- Consumer (subscribing to Manator API)
- Authentication
- Errors
- Logging

## References and Helpful Links

The following links would further aid the understanding of Octonet

- [Inversify](https://github.com/inversify/InversifyJS#readme)
- [Reflect Metadata](https://rbuckton.github.io/reflect-metadata/)
- [Typescript Decorators](https://www.typescriptlang.org/docs/handbook/decorators.html)
- [AMPQ Client docs for NodeJs](http://www.squaremobius.net/amqp.node/channel_api.html)
- [Bunyan](https://github.com/trentm/node-bunyan#readme)
