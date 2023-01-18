import { AxiosError, AxiosInstance, AxiosRequestConfig } from "axios";
import { Request } from "express";
import FormData from "form-data";
import { each } from "lodash";
import qs from "qs";
import { v4 } from "uuid";

import { APIError, HttpError, NoAuthorizationTokenError, NoRequestIDError, TimeoutError } from "./errors";
import { encode } from "./jwt";

export interface AuthConfig {
  scheme: string;
  secret: Uint8Array;
  timeout: string;
}

/**
 * Any type of async code to be run. Not the actions will not be bound to the
 * request wrapper.
 */
export type Action = () => Promise<void>;
/**
 * A function that can configure an axios request. Use the `defer` function
 * to push async work till the end of configuration
 */
export type Plugin<T = any> = (req: AxiosRequestConfig<T>, defer: (action: Action) => void) => void;

export type RequestData<T extends object> = T | FormData | string;

export class RequestWrapper<T extends object> {
  private asyncActions: Action[] = [];

  constructor(
    protected instance: AxiosInstance,
    protected service: string,
    protected authConfig: AuthConfig,
    protected request: AxiosRequestConfig<RequestData<T>>
  ) {
    this.request.headers = Object.assign({}, request.headers);
  }

  /**
   * Adds asynchronous code to be run just before making a request. This mainly
   * helps to keep the wrapper API consisten by not doing anything async till the requeust
   * is made
   * @param action asynchronous action.
   */
  protected defer(action: Action) {
    this.asyncActions.push(action);
    return this;
  }

  /**
   * Use a plugin
   * @param plugin any function that wants to configure an axios request
   */
  use(plugin: Plugin<RequestData<T>>) {
    plugin(this.request, (action: Action) => {
      this.defer(action);
    });

    return this;
  }

  /**
   * Set the content-type of the request
   * @param t type of request body
   */
  type(t: "json" | "form" | "urlencoded" = "json") {
    switch (t) {
      case "json":
        Object.assign(this.request.headers, { "Content-Type": "application/json" });
        break;
      case "urlencoded":
        this.request.data = qs.stringify(this.request.data);
        Object.assign(this.request.headers, { "Content-Type": "application/x-www-form-urlencoded" });
        break;
      case "form":
        const form = new FormData();
        each(this.request.data as T, (v, k) => {
          form.append(k, v);
        });

        this.request.data = form;
        Object.assign(this.request.headers, form.getHeaders());
        break;
    }

    return this;
  }

  /**
   * Set multiple header values at once
   * @param headers header key value pairs
   */
  set(headers: object): this;
  /**
   * Set single header value at once
   * @param key header
   * @param value value of header
   */
  set(key: string, value: string): this;
  set(key: string | object, value?: string) {
    let headers = {};
    if (typeof key === "string") {
      headers[key] = value;
    } else {
      headers = key;
    }

    Object.assign(this.request.headers, typeof key === "string" ? { [key]: value } : key);

    return this;
  }

  /**
   * Enable distributed tracing on the request
   * @param req source request if there's any
   */
  track(req?: Request) {
    // make sure request ID exists for non-base requests
    if (req && !req.headers["x-request-id"]) {
      throw new NoRequestIDError(this.request.url);
    }

    Object.assign(this.request.headers, {
      "X-Request-ID": !!req ? req.headers["x-request-id"] : v4(),
      "X-Origin-Service": this.service
    });

    return this;
  }

  /**
   * Attach session information to the request
   * @param reqSession authenticated express request or session object for headless request
   */
  auth(reqSession?: Request | any) {
    const isReq = reqSession && "headers" in reqSession;

    if (isReq) {
      if (!reqSession.headers.authorization) {
        throw new NoAuthorizationTokenError(this.request.url);
      }

      Object.assign(this.request.headers, {
        Authorization: reqSession.headers.authorization
      });

      return this;
    } else {
      if (!reqSession) {
        reqSession = { service: this.service, request_time: new Date() } as any;
      }

      // push till when the request is being made
      return this.defer(async () => {
        const token = await encode(this.authConfig.secret, this.authConfig.timeout, reqSession);

        Object.assign(this.request.headers, {
          Authorization: `${this.authConfig.scheme} ${token}`
        });
      });
    }
  }

  /**
   * Runs the API request and handles errors.
   * @param timeout timeout for request in seconds
   */
  async do<T = any>(timeout = 10): Promise<T> {
    // call deferred actions
    for (const iterator of this.asyncActions) {
      await iterator();
    }

    return this.instance({ timeout: timeout * 1000, ...this.request }).then(
      res => res.data,
      (err: AxiosError) => {
        if (err.response) {
          throw new APIError(err.config.url, err.response.status, err.response.data);
        } else if (err.request) {
          if (err.code === AxiosError.ETIMEDOUT || err.code === AxiosError.ECONNABORTED) {
            throw new TimeoutError(err.config.url, err.config.timeout);
          }
          throw new HttpError(err.config.url, err);
        } else {
          throw new Error(err.message);
        }
      }
    );
  }
}
