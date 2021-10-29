import { Request } from "express";
import { NoRequestIDError } from "./errors";
import { Client, HttpMethod } from "./normie";

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
export class HeadlessClient extends Client {
  constructor(service: string, scheme: string, secret: string) {
    super(service);
  }

  makeRequest(req: Request, method: HttpMethod, url: string, timeout = 10, headers = {}) {
    // enables distributed tracing
    if (!req.headers["x-request-id"]) {
      throw new NoRequestIDError(url);
    }
    headers["X-Request-ID"] = req.headers["x-request-id"];
    headers["X-Origin-Service"] = this.service;

    // share authentication between service calls
    if (req.session) {
      headers["Authorization"] = req.headers.authorization;
    }

    return superagent(method, url)
      .type("json")
      .set(headers)
      .timeout({ response: timeout * 1000 });
  }
}
