import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import { APIError, HttpError } from "./errors";

export enum HttpMethod {
  GET = "GET",
  POST = "POST",
  PUT = "PUT",
  PATCH = "PATCH",
  DELETE = "DELETE"
}

export type HttpRequest<T = any> = AxiosRequestConfig<T>;

export class HttpClient {
  protected instance: AxiosInstance;

  constructor() {
    this.instance = axios.create({ headers: { "Content-Type": "application/json" } });
  }

  /**
   * Runs the API requests and handles errors.
   * @param req super agent request, most probably created using `makeRequest`
   * @param timeout timeout for request in seconds
   */
  do<T>(req: HttpRequest, timeout = 10): Promise<T> {
    return this.instance({ timeout, ...req }).then(
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
}
