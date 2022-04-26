# HTTP (Interservice communication)

This section describes the HTTP module of Octonet as well as practical applications.

## About

The HTTP module is used to make API requests such as:

- User-initiated requests
- System-level requests
- External API requests

These are explained in more detail [here](Authentication.md)

### Http Agent

The http agent is used for making external API requests and has the following methods

- **useLogger(logger:_Logger_)**: Sets the logger to be used for logging requests

The http agent also has the following methods to make requests

- **get(url**: _string_, **params?**: _object_**)**: _RequestWrapper_
- **post(url**: _string_, **body?:** _object_**)**: _RequestWrapper_
- **put(url**: _string_, **body?**: _object_**)**: _RequestWrapper_
- **patch(url**: _string_, **body?**: _object_**)**: _RequestWrapper_
- **del(url**: _string_, **params?**: _object_**)**: _RequestWrapper_

which all return a **RequestWrapper** object to make requests.  
The request wrapper can then be chained with the following methods to add more data to the request.

- **do(timeout?**: _number_**)**: This is always the final function in the chain and returns the response from the request made. it takes a timeout parameter which ensures the request returns error if the specified time limit is exceeded
- **track(req?**: _Request_ **)**: Checks that the request passed in has id. If no request is passed in it sets an id value on root request.
- **set(key**: _string_ , **val**: _string_ **)**: Sets value of request header
- **auth(req?**: _Request_ **)**: checks for authorization token in request. Also adds authorization token for the service making request if no request is defined
- **type(t**: _"json" | "form" | "urlencoded"_**)**: sets the request Content-type

## HTTP Errors

The various types of HTTP errors provided by Octonet are summarized in the table below

| Error Class                 | Description                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `NoRequestIDError`          | Usually thrown when a request header `X-Request-ID` is absent (i.e, `req.headers['x-request-id']` is `undefined`).                         |
| `NoAuthorizationTokenError` | Usually thrown when a request is sent without a token (i.e, `req.headers.authorization` is `undefined`).                                   |
| `HttpError`                 | Usually thrown when a request to a particular url endpoint failed without a status code..                                                  |
| `TimeoutError`              | Usually thrown when a request to an endpoint has exceeded the configured timeout value.                                                    |
| `APIError`                  | Usually thrown when a request to an API endpoint failed with a specified status code (which gives an insight to the reason for the error). |

## Example using HTTP Agent and Errors

```typescript
import { AgentConfig, HttpAgent, Logger } from "@risemaxi/octonet";

const env = process.env;

const logger = new Logger({ name: env.service_name, serializers: defaultSerializers() });
const HTTPAgentConfig: AgentConfig = {
  service: env.service_name,
  scheme: env.auth_scheme,
  secret: env.service_secret,
  logger: logger
};

const http = new HttpAgent(HTTPAgentConfig)(
  // immediately invoking function
  async function () {
    let url = env.URL;
    let token = "Rise Token";
    let data = {
      email: "email@rise.com",
      password: "password223"
    };
    try {
      const response = await http.post(url, data).set("Authorization", token).track().do();
      console.log(response);
    } catch (error) {
      if (error instanceof NoRequestIDError) {
        //this happens when .track is called with an a request argument that has no 'x-request-id' in the headers
        console.log("Request headers has does not have required field x-request-id");
      } else if (error instanceof NoAuthorizationTokenError) {
        //this happens when .auth is called with a request argument that has no authorization field in the headers.
        console.log("Request headers has does not have required field authorization");
      } else if (error instanceof TimeoutError) {
        //this happens when timeout of the request is exceeded
        console.log("Request timed out");
      } else if (error instanceof APIError) {
        //this happens when a defined error and status code
        console.log(`request failed with status ${error.status} with data ${error.data}`);
      } else if (error instanceof HttpError) {
        //When an error occurs that doesnt fit into any of the above scenarios then it is treated an ah http error
        console.log("Sonething went wrong, but we don't know what it is.");
        console.log(error.rawError);
      }
      console.log(error.messsage);
    }
  }
);
```
