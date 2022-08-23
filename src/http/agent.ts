import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";

import { Logger } from "../logging/logger";
import { AuthConfig, RequestWrapper } from "./wrapper";

export enum HttpMethod {
  GET = "GET",
  POST = "POST",
  PUT = "PUT",
  PATCH = "PATCH",
  DELETE = "DELETE"
}

/**
 * Configuration for the agent.
 */
export interface AgentConfig {
  /**
   * name of the service that'll be making these requests
   */
  service: string;
  /**
   * custom scheme for system requests
   */
  scheme: string;
  /**
   * secret and for encrypting & signing requests
   */
  secret: string;
  /**
   * default timeout for request tokens in seconds. Defaults to 10s
   */
  timeout?: string;
  /**
   * Log axios requests, responses and errors.
   */
  logger?: Logger;
}

export class HttpAgent {
  protected instance: AxiosInstance;
  private service: string;
  private authConfig: AuthConfig;

  constructor(config: AgentConfig, axiosConfig?: AxiosRequestConfig) {
    this.instance = axios.create({ transitional: { clarifyTimeoutError: true }, ...axiosConfig });
    this.service = config.service;
    this.authConfig = {
      secret: new TextEncoder().encode(config.secret),
      scheme: config.scheme,
      timeout: config.timeout ?? "10s"
    };

    if (config.logger) {
      this.useLogger(config.logger);
    }
  }

  /**
   * Create and wrapper an HTTP request for easy configuration.
   * @param method HTTP method of API
   * @param url absolute URL of API
   * @param data request body payload
   */
  makeRequest<T extends object = any>(method: HttpMethod, url: string, data?: T) {
    const httpRequest: AxiosRequestConfig<T> = { method, url };

    switch (method) {
      case HttpMethod.GET:
      case HttpMethod.DELETE:
        httpRequest.params = data;
        break;
      default:
        httpRequest.data = data;
    }

    return new RequestWrapper(this.instance, this.service, this.authConfig, httpRequest);
  }

  /**
   * Log axios requests, responses and errors.
   * @param logger logger setup with axios request/response serializers
   */
  private useLogger(logger: Logger) {
    const onRequest = (reqConfig: AxiosRequestConfig) => {
      logger.axiosRequest(reqConfig);
      return reqConfig;
    };
    const onResponse = (res: AxiosResponse) => {
      logger.axiosResponse(res);
      return res;
    };
    const onErrorResponse = (err: any) => {
      logger.axiosError(err);
      return Promise.reject(err);
    };

    this.instance.interceptors.request.use(onRequest, Promise.reject);
    this.instance.interceptors.response.use(onResponse, onErrorResponse);
  }

  /**
   * Makes a get request
   * @param url absolute URL
   * @param params query parameters
   */
  get<T extends object = any>(url: string, params?: T) {
    return this.makeRequest(HttpMethod.GET, url, params);
  }

  /**
   * Makes a post request
   * @param url absolute URL
   * @param body request body payload
   */
  post<T extends object = any>(url: string, body?: T) {
    return this.makeRequest(HttpMethod.POST, url, body);
  }

  /**
   * Makes a put request
   * @param url absolute URL
   * @param body request body payload
   */
  put<T extends object = any>(url: string, body?: T) {
    return this.makeRequest(HttpMethod.PUT, url, body);
  }

  /**
   * Makes a patch request
   * @param url absolute URL
   * @param body request body payload
   */
  patch<T extends object = any>(url: string, body?: T) {
    return this.makeRequest(HttpMethod.PATCH, url, body);
  }

  /**
   * Makes a delete request
   * @param url absolute URL
   * @param params query parameters
   */
  del<T extends object = any>(url: string, params?: T) {
    return this.makeRequest(HttpMethod.DELETE, url, params);
  }
}
