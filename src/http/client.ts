import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from "axios";
import { APIError, HttpError, TimeoutError } from "./errors";

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
  do<T = any>(req: HttpRequest, timeout = 10): Promise<T> {
    return this.instance({ timeout: timeout * 1000, ...req }).then(
      res => res.data,
      (err: AxiosError) => {
        if (err.response) {
          throw new APIError(err.config.url, err.response.status, err.response.data);
        } else if (err.request) {
          if (/timeout/.test(err.message)) {
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
