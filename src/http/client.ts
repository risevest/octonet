import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import { APIError, HttpError } from "./errors";

export interface IHttpClient {
  do<T>(req: HttpRequest): Promise<T>;
}

export enum HttpMethod {
  GET = "GET",
  POST = "POST",
  PUT = "PUT",
  PATCH = "PATCH",
  DELETE = "DELETE"
};

export interface HttpRequest extends AxiosRequestConfig { }

export class HttpClient {
  protected timeout = 10;

  constructor(protected service: string) { }
  /**
  * Runs the API requests and handles errors.
  * @param req super agent request, most probably created using `makeRequest`
  */
  do<T>(req: HttpRequest): Promise<T> {
    req.timeout = this.timeout

    return axios(req).then(
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