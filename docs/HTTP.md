# HTTP (Interservice communication)

This section describes the HTTP module of Octonet as well as practical applications.

## About

The HTTP module is used to make API requests such as:

- User-initiated requests
- System-level requests
- External API requests

Let's explain these in more detail.

### User-initiated requests

These are API requests initiated by the user, which typically requires a user session. A user session can only be accessed by a cryptographic token, and is uniquely differentiated from a system session by the `scheme` contained in the authorization header.

An authorization header comprises of the `scheme` and the `token`, separated by a space in a single string. In this case, this could be:

```js
// express request header
req.headers.authorization = `Bearer ${token}`.
```

The scheme in this case is `Bearer`.

#### Practical application (in progress)

### System-level requests

These are requests initiated by a service on behalf of a user. These requests also require a system session, which can be accessed by an authorization header. A system session header could be differentiated from a user session by means of a custom defined `scheme` (apart from `Bearer`) represented in the request header. For example,

```js
// express request header
req.headers.authorization = `Rise ${token}`;
```

In this case, the custom-defined scheme is `Rise`. It could be any other arbitrary value.

#### Practical application (in progress)

### External API requests

These are requests made from a service to an external (third-party) service. For example, the transaction service making a request to Paystack.

#### Practical application (in progress)

## HTTP Errors

The various types of HTTP errors provided by Octonet are summarized in the table below

| Error Class                 | Description                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `NoRequestIDError`          | Usually thrown when a request header `X-Request-ID` is absent (i.e, `req.headers['x-request-id']` is `undefined`).                         |
| `NoAuthorizationTokenError` | Usually thrown when a request is sent without a token (i.e, `req.headers.authorization` is `undefined`).                                   |
| `HttpError`                 | Usually thrown when a request to a particular url endpoint failed without a status code..                                                  |
| `TimeoutError`              | Usually thrown when a request to an endpoint has exceeded the configured timeout value.                                                    |
| `APIError`                  | Usually thrown when a request to an API endpoint failed with a specified status code (which gives an insight to the reason for the error). |

### Basic example

Let's see a basic example

```js
// example.ts

import express from "express";
import { NoRequestIDError } from "@risemaxi/octonet";

// express app
const app = express();

// simple API
app.get('/test-route', (req, res) => {
    try {
           doSomething();
        } catch(err){
            throw new NoRequestIDError(req.url);
        }
    }
});
```
