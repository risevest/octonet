import { v4 } from "uuid";
import { HttpClient, HttpMethod, HttpRequest, IHttpClient } from "./client";

export class BaseClient extends HttpClient implements IHttpClient {
  protected defaultTimeout = 10;

  constructor(service: string) {
    super(service)
  }

  /**
   * Create a pre-configured axios request with distributed tracing and authentication
   * @param method HTTP method of API
   * @param url absolute URL of API
   * @param data request body payload
   */
  makeRequest(method: HttpMethod, url: string, data: {}) {
    const headers = {}
    headers["X-Request-ID"] = this.generateRequestId();
    headers["X-Origin-Service"] = this.service;

    const httpRequest: HttpRequest = { method, url, headers }

    if (method == HttpMethod.GET) {
      httpRequest.params = data;
    } else {
      httpRequest.data = data;
    }

    return httpRequest

  }

  /**
   * creates a request id 
   * @returns string
  */
  private generateRequestId(): string {
    return v4();
  }

  /**
   * makes a get request
   * @param url absolute URL
   * @param params query parameters
   * @param headers custom headers to set
   */
  get<T = any>(url: string, params = {}, headers = {}) {
    const request = this.makeRequest(HttpMethod.GET, url, params);
    request.headers = { ...headers, ...request.headers };
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
    const request = this.makeRequest(HttpMethod.POST, url, body);
    request.headers = { ...headers, ...request.headers };
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
    const request = this.makeRequest(HttpMethod.PUT, url, body);
    request.headers = { ...headers, ...request.headers };
    return this.do<T>(request);
  }

  /**
   * makes a patch request
   * @param url absolute URL
   * @param body request body payload
   * @param headers custom headers to set
   * @returns 
   */
  patch<T = any>(url: string, body: {}, headers = {}) {
    const request = this.makeRequest(HttpMethod.PATCH, url, body);
    request.headers = { ...headers, ...request.headers };
    return this.do<T>(request);
  }

  /**
   * makes a delete request
   * @param url absolute URL
   * @param body request body payload
   * @param headers custom headers to set
   * @returns 
   */
  del<T = any>(url: string, body: {}, headers = {}) {
    const request = this.makeRequest(HttpMethod.DELETE, url, body);
    request.headers = { ...headers, ...request.headers };
    return this.do<T>(request);
  }
}