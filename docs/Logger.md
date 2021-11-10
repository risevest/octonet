# Logger

The Logger is a feature in Octonet which provides utility functions that enables logging for the purpose of distributed tracing, metrics collection or other purposes. It utilises the [Bunyan](https://github.com/trentm/node-bunyan#readme) library for its functionalities,as well as the [Express](https://expressjs.com/en/api.html#express) [Request](https://expressjs.com/en/api.html#req) and [Response](https://expressjs.com/en/api.html#res) objects as inputs.

## Utility Functions

The utility functions are as described below:

### request(req: Request)

The _request_ function logs an incoming HTTP request.

#### Parameters

**req:** Express request object

### response(res: Response)

The _response_ function logs an outgoing HTTP response

#### Parameters

**res:** Express request object

### httpError(err: Error, req: Request, res: Response)

The _httpError_ function Logs an error that occured during the handling of an HTTP request.

#### Parameters

**err:** Error object
**req:** Express request object
**res:** Express response object

### axiosRequest(req: AxiosRequestConfig)

The _axiosRequest_ function logs an axios request

#### Parameters

**req:** [AxiosRequestConfig](https://axios-http.com/docs/req_config) object

### axiosResponse(res: AxiosResponse)

The _axiosResponse_ function logs response to axios request

#### Parameters

**res:** [AxiosResponse](https://axios-http.com/docs/res_schema) object

### axiosError(err: AxiosError)

The _axiosError_ function logs error response to axios request

#### Parameters

**err:** [AxiosError](https://axios-http.com/docs/handling_errors) object

### log(entry: string | object)

The _log_ message logs simple messages

#### Parameters

**entry:** Entry message to be logged

### error(message: string | LogError)

The _error_ function logs internal application error.

#### Parameters

**message:** additional error description

## Practical examples

Let's look at practical examples of the Logger module

```js
import express from "express";
import { Logger, defaultSerializers } from "@risevest/octonet";

// create the Logger instance
const logger: Logger = new Logger({
  name: "wallet_demo",
  serializers: defaultSerializers("password"),
  verbose: false
});

// Express-related Logger utility functions
app.get("/test", (err, req, res) => {
  logger.request(req);
  logger.response(res);
  logger.httpError(err, req, res);
});

// axios-related utility functions

// others
logger.log("transactionn service called");
logger.error("an internal server error has occured");
```
