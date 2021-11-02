import axios, { AxiosResponse } from "axios";
import { APIError, HttpError, NoAuthorizationTokenError, NoRequestIDError } from "./errors";
import { v4 } from "uuid";

export enum HttpMethod {
  GET = "GET",
  POST = "POST",
  PUT = "PUT",
  PATCH = "PATCH",
  DELETE = "DELETE"
};

type MakeRequestResponse = Promise<AxiosResponse>

/**
 * Wrapper around superagent for supporting interservice API requests.
 */
export class Client {
  /**
   * @param service name of the originating service
   */
  constructor(protected service: string) { }

  /**
   * Runs the API requests and handles errors.
   * @param req super agent request, most probably created using `makeRequest`
   */
  protected do<T>(req: MakeRequestResponse): Promise<T> {
    return req.then(
      res => res.data,
      err => {
        if (err.response) {
          throw new APIError(err.config.url, err.response.status, err.response.body);
        } else if (err.request) {
          throw new HttpError(err.config.url, err);
        } else {
          throw new Error(err.message);
        }
      }
    );
  }

  /**
   * Create a pre-configured superagent request with distributed tracing and authentication
   * @param method HTTP method of API
   * @param url absolute URL of API
   * @param data request body payload
   * @param headers custom headers to set
   * @param req Express request that serves as the originator for service call
   * @param timeout timeout in seconds
   */
  protected makeRequest(method: HttpMethod, url: string, data: {}, requestHeaders: {}, timeout = 10) {
    const headers = {};
    // enables distributed tracing
    if (!requestHeaders["x-request-id"]) {
      throw new NoRequestIDError(url);
    }
    headers["X-Request-ID"] = requestHeaders["x-request-id"];
    headers["X-Origin-Service"] = this.service;

    // share authentication between service calls
    if (!requestHeaders["authorization"]) {
      throw new NoAuthorizationTokenError(url);
    }

    headers["Authorization"] = requestHeaders["authorization"];
    return axios.request({
      url,
      method,
      headers,
      data,
      timeout: timeout * 1000
    })
  }

  /**
   * creates a request id 
   */
  protected genetateRequestId(): string {
    return v4();
  }

  /**
   * makes a get request
   * @param url absolute URL
   * @param headers custom headers to set
   */
  get<T = any>(url: string, headers = {}) {
    const request = this.makeRequest(HttpMethod.GET, url, {}, headers);
    return this.do<T>(request);
  }

  /**
   * makes a post request
   * @param url absolute URL
   * @param body request body payload
   * @param headers custom headers to set
   * @returns 
   */
  post<T = any>(url: string, body: {}, headers = {}) {
    const request = this.makeRequest(HttpMethod.POST, url, body, headers);
    return this.do<T>(request);
  }

  /**
   * makes a put request
   * @param url absolute URL
   * @param body request body payload
   * @param headers custom headers to set
   * @returns 
   */
  put<T = any>(url: string, body: {}, headers = {}) {
    const request = this.makeRequest(HttpMethod.PUT, url, body, headers);
    return this.do<T>(request);
  }

  /**
   * makes a patch request
   * @param url absolute URL
   * @param body request body payload
   * @param headers custom headers to set
   * @param req Express request that serves as the originator for service call
   * @returns 
   */
  patch<T = any>(url: string, body: {}, headers = {}) {
    const request = this.makeRequest(HttpMethod.PATCH, url, body, headers);
    return this.do<T>(request);
  }

  /**
   * makes a delete request
   * @param url absolute URL
   * @param body request body payload
   * @param headers custom headers to set
   * @param req Express request that serves as the originator for service call
   * @returns 
   */
  delete<T = any>(url: string, body: {}, headers = {}) {
    const request = this.makeRequest(HttpMethod.DELETE, url, body, headers);
    return this.do<T>(request);
  }
}
