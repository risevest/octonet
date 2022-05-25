import { AxiosRequestConfig, AxiosResponse } from "axios";
import { stdSerializers } from "bunyan";
import { Request, Response } from "express";
import unset from "lodash/unset";

const axiosDefaultHeaders = ["common", "delete", "get", "head", "post", "put", "patch"];

/**
 * Create serializers for common log entries. This entries would
 * be avoided for:
 * - Client log entries for axios request/response
 * - Server log entries requests and responses
 * - Consumer log entries for events
 * @param paths paths to not print anywhere
 */
export function defaultSerializers(...paths: string[]) {
  return {
    axios_req: axiosRequest(...paths),
    axios_res: axiosResponse,
    req: expressRequest(...paths),
    res: expressResponse,
    event: sanitized(...paths),
    err: stdSerializers.err
  };
}

export function sanitized<T = any>(...paths: string[]) {
  return (data: T) => {
    if (!data || typeof data !== "object" || Object.keys(data).length === 0) return data;

    const dataCopy = { ...data };
    paths.forEach(p => unset(dataCopy, p));

    return dataCopy;
  };
}

/**
 * Create serializer for axios requests
 * @param paths sensitive data pasths
 */
export function axiosRequest(...paths: string[]) {
  return (conf: AxiosRequestConfig) => {
    const log = { method: conf.method, url: conf.url, headers: conf.headers, params: conf.params };

    // remove default header config
    const headers = { ...conf.headers };
    axiosDefaultHeaders.forEach(k => {
      delete headers[k];
    });
    log.headers = headers;

    // when we get the config from the axios response
    if (typeof conf.data === "string") {
      conf.data = JSON.parse(conf.data);
    }

    if (conf.data && Object.keys(conf.data).length !== 0) {
      const logBody = { ...conf.data };
      paths.forEach(p => unset(logBody, p));

      log["data"] = logBody;
    }

    return log;
  };
}

/**
 * Serializer for axios responses
 * @param res axios response object
 */
export function axiosResponse(res: AxiosResponse<any>) {
  return {
    statusCode: res.status,
    headers: res.headers,
    body: res.data
  };
}

/**
 * Create serializer for express requests
 * @param paths sensitive data pasths
 */
export function expressRequest(...paths: string[]): (req: Request) => object {
  return (req: Request) => {
    if (!req || !req.socket) return req;

    const log = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      params: req.params,
      remoteAddress: req.socket.remoteAddress,
      remotePort: req.socket.remotePort
    };

    if (req.body && Object.keys(req.body).length !== 0) {
      const logBody = { ...req.body };
      paths.forEach(p => unset(logBody, p));

      log["body"] = logBody;
    }

    return log;
  };
}

/**
 * Serializer for express responses
 * @param res express response object
 */
export function expressResponse(res: Response) {
  if (!res || !res.statusCode) return res;

  return {
    statusCode: res.statusCode,
    headers: res.getHeaders(),
    body: res.locals.body
  };
}
