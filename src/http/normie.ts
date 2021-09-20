import { Request } from "express";
import superagent, { SuperAgentRequest } from "superagent";
import { APIError, HttpError, NoRequestIDError } from "./errors";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Wrapper around superagent for supporting interservice API requests.
 */
export class Client {
  /**
   * @param service name of the originating service
   */
  constructor(protected service: string) {}

  /**
   * Runs the API requests and handles errors.
   * @param req super agent request, most probably created using `makeRequest`
   */
  do<T>(req: SuperAgentRequest): Promise<T> {
    return req.then(
      res => res.body,
      err => {
        if (!err.status || !err.response) {
          return new HttpError(req.url, err);
        } else {
          return new APIError(req.url, err.status, err.response.body);
        }
      }
    );
  }

  /**
   * Create a pre-configured superagent request with distributed tracing and authentication
   * @param req Express request that serves as the originator for service call
   * @param method HTTP method of API
   * @param url absolute URL of API
   * @param timeout timeout in seconds
   * @param headers custom headers to set
   */
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
