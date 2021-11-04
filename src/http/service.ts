import { Request } from "express";
import { HttpClient, HttpMethod, HttpRequest } from "./client";
import { NoAuthorizationTokenError, NoRequestIDError } from "./errors";

/**
 * Wrapper around superagent for supporting interservice API requests.
 */
export class ServiceClient extends HttpClient {
  /**
   * @param service name of the originating service
   */
  constructor(protected service: string) {
    super();
  }

  /**
   * Create a pre-configured superagent request with distributed tracing and authentication
   * @param req Express request that serves as the originator for service call
   * @param method HTTP method of API
   * @param url absolute URL of API
   * @param data request data to be sent to API
   */
  makeRequest(req: Request, method: HttpMethod, url: string, data?: any) {
    const headers = {};
    // enables distributed tracing
    if (!req.headers["x-request-id"]) {
      throw new NoRequestIDError(url);
    }
    headers["X-Request-ID"] = req.headers["x-request-id"];
    headers["X-Origin-Service"] = this.service;

    // share authentication between service calls
    if (!req.headers.authorization) {
      throw new NoAuthorizationTokenError(url);
    }

    headers["Authorization"] = req.headers.authorization;

    const httpRequest: HttpRequest = { url, method, headers };

    switch (method) {
      case HttpMethod.GET:
      case HttpMethod.DELETE:
        httpRequest.params = data;
        break;
      default:
        httpRequest.data = data;
    }

    return httpRequest;
  }

  /**
   * Makes a get request
   * @param req Express request that serves as the originator for service call
   * @param url absolute URL
   * @param param query parameters
   * @param headers custom headers to set
   */
  get<T = any>(req: Request, url: string, params?: any, headers?: any) {
    const request = this.makeRequest(req, HttpMethod.GET, url, params);
    request.headers = { ...headers, ...request.headers };
    return this.do<T>(request);
  }

  /**
   * Makes a post request
   * @param req Express request that serves as the originator for service call
   * @param url absolute URL
   * @param body request body payload
   * @param headers custom headers to set
   */
  post<T = any>(req: Request, url: string, body?: any, headers?: any) {
    const request = this.makeRequest(req, HttpMethod.POST, url, body);
    request.headers = { ...headers, ...request.headers };
    return this.do<T>(request);
  }

  /**
   * Makes a put request
   * @param req Express request that serves as the originator for service call
   * @param url absolute URL
   * @param body request body payload
   * @param headers custom headers to set
   */
  put<T = any>(req: Request, url: string, body?: any, headers?: any) {
    const request = this.makeRequest(req, HttpMethod.PUT, url, body);
    request.headers = { ...headers, ...request.headers };
    return this.do<T>(request);
  }

  /**
   * Makes a patch request
   * @param req Express request that serves as the originator for service call
   * @param url absolute URL
   * @param body request body payload
   * @param headers custom headers to set
   */
  patch<T = any>(req: Request, url: string, body?: any, headers?: any) {
    const request = this.makeRequest(req, HttpMethod.PATCH, url, body);
    request.headers = { ...headers, ...request.headers };
    return this.do<T>(request);
  }

  /**
   * Makes a delete request
   * @param req Express request that serves as the originator for service call
   * @param url absolute URL
   * @param params query parameters
   * @param headers custom headers to set
   */
  del<T = any>(req: Request, url: string, params?: any, headers?: any) {
    const request = this.makeRequest(req, HttpMethod.DELETE, url, params);
    request.headers = { ...headers, ...request.headers };
    return this.do<T>(request);
  }
}
