import { Client, HttpMethod } from "./normie";
import axios from "axios";

export class BaseClient extends Client {
  constructor(service: string) {
    super(service);
  }

  /**
 * Create a pre-configured axios request with distributed tracing and authentication
 * @param method HTTP method of API
 * @param url absolute URL of API
 * @param data request body payload
 * 
 * @param headers custom headers to set
 * @param req Express request that serves as the originator for service call
 * @param timeout timeout in seconds
 */
  protected makeRequest(method: HttpMethod, url: string, data: {}, headers = {}, timeout = 10) {
    headers["X-Request-ID"] = this.genetateRequestId();
    headers["X-Origin-Service"] = this.service;

    return axios.request({
      url,
      method,
      headers,
      data,
      timeout: timeout * 1000
    })
  }
}