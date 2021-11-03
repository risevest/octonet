import { Request } from "express";
import { NoRequestIDError } from "./errors";
import { ServiceClient } from "index";
import { HttpMethod, HttpRequest, IHttpClient } from "./client";

/**
 * Configuration for creating a client
 */
export interface ClientConfig {
  /**
   * Service secret used for signing headless requests
   */
  secret: string;
  /**
   * Name of the service using this client
   */
  serviceName: string;
  /**
   * Authentication scheme used for headless requests
   */
  scheme: string;
}

/**
 * Client for making requests between services when no user session
 * has to be shared
 */
export class HeadlessClient extends ServiceClient implements IHttpClient {
  constructor(service: string, scheme: string, secret: string) {
    super(service);
  }

  makeRequests(req: Request, method: HttpMethod, url: string, data: {}) {
    const headers = {};
    // enables distributed tracing
    if (!req.headers["x-request-id"]) {
      throw new NoRequestIDError(url);
    }
    headers["X-Request-ID"] = req.headers["x-request-id"];
    headers["X-Origin-Service"] = this.service;

    // share authentication between service calls
    if (req.headers.authorization) {
      headers["Authorization"] = req.headers.authorization;
    }

    const httpRequest: HttpRequest = { method, url, headers }

    if (method == HttpMethod.GET) {
      httpRequest.params = data;
    } else {
      httpRequest.data = data;
    }

    return httpRequest
  }
}
