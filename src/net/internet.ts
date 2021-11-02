import axios, { AxiosInstance, AxiosResponse } from "axios";
// import { Logger } from "../logging";
import { APIError, HttpError } from "./errors";
import { HttpMethod } from "./types";

export class InternetService {
  private client: AxiosInstance;

  constructor(timeout: number, logger: {}) {
    this.client = axios.create({ timeout, headers: { "Content-Type": "application/json" } });
    // this.client.interceptors.request.use(
    //   conf => {
    //     logger.log({ http_req: conf });
    //     return conf;
    //   },
    //   err => Promise.reject(err)
    // );

    // this.client.interceptors.response.use(
    //   res => {
    //     logger.log({ http_req: res.config, http_res: res });
    //     return res;
    //   },
    //   err => {
    //     if (err.response) {
    //       logger.error({ err, http_req: err.response.config, http_res: err.response });
    //     } else {
    //       logger.error({ err });
    //     }

    //     return Promise.reject(err);
    //   }
    // );
  }

  async makeRequest<T>(method: HttpMethod, url: string, headers = {}, data?: any): Promise<T> {
    try {
      const response = await this.client.request<any, AxiosResponse<T>>({ method, url, headers, data });
      return response.data;
    } catch (err) {
      if (err.response) {
        throw new APIError(err.config.url, err.response.status, err.response.data);
      } else {
        throw new HttpError(err.config.url, err);
      }
    }
  }

  public post<T = any>(url: string, data: any, headers = {}) {
    return this.makeRequest<T>("POST", url, headers, data);
  }

  public put<T = any>(url: string, data: any, headers = {}) {
    return this.makeRequest<T>("PUT", url, headers, data);
  }

  public patch<T = any>(url: string, data: any, headers = {}) {
    return this.makeRequest<T>("PATCH", url, headers, data);
  }

  public get<T = any>(url: string, headers: object, params = {}) {
    return this.makeRequest<T>("GET", url, headers, params);
  }

  public del<T = any>(url: string, headers: object, params = {}) {
    return this.makeRequest<T>("DELETE", url, headers, params);
  }
}
