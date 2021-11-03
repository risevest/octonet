import { AxiosRequestConfig, AxiosResponse } from "axios";
import { Request, Response } from "express";
import unset from "lodash/unset";

export function defaultSerializers(...paths: string[]) {
  return {
    axios_req: axiosRequest(...paths),
    axios_res: axiosResponse,
    req: expressRequest(...paths),
    res: expressResponse
  };
}

/**
 * Create serializer for axios requests
 * @param paths sensitive data pasths
 */
export function axiosRequest(...paths: string[]) {
  return (conf: AxiosRequestConfig) => {
    const log = { method: conf.method, url: conf.url, headers: conf.headers };

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
      remoteAddress: req.socket.remoteAddress,
      remotePort: req.socket.remotePort
    };

    if (req.body && Object.keys(req.body).length !== 0) {
      // sanitize first`
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
