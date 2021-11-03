import { Logger } from "../logging/logger";
import { HttpClient, HttpMethod, HttpRequest } from "./client";

export class ExternalClient extends HttpClient {
  constructor(logger: Logger) {
    super();
    this.instance.interceptors.request.use(
      conf => {
        logger.axiosRequest(conf);
        return conf;
      },
      err => Promise.reject(err)
    );

    this.instance.interceptors.response.use(
      res => {
        logger.axiosResponse(res);
        return res;
      },
      err => {
        if (err.response) {
          logger.axiosError(err);
        } else {
          logger.error({ err });
        }

        return Promise.reject(err);
      }
    );
  }

  makeRequest<T>(method: HttpMethod, url: string, data?: any): HttpRequest<T> {
    const httpRequest: HttpRequest = { method, url };

    if (method === HttpMethod.GET) {
      httpRequest.params = data;
    } else {
      httpRequest.data = data;
    }

    return httpRequest;
  }

  /**
   * Makes a get request
   * @param url absolute URL
   * @param params query parameters
   * @param headers custom headers to set
   */
  get<T = any>(url: string, params?: any, headers?: any) {
    const request = this.makeRequest(HttpMethod.GET, url, params);
    return this.do<T>({ ...request, headers });
  }

  /**
   * Makes a post request
   * @param url absolute URL
   * @param body request body payload
   * @param headers custom headers to set
   */
  post<T = any>(url: string, body?: any, headers?: any) {
    const request = this.makeRequest(HttpMethod.POST, url, body);
    return this.do<T>({ ...request, headers });
  }

  /**
   * Makes a put request
   * @param url absolute URL
   * @param body request body payload
   * @param headers custom headers to set
   */
  put<T = any>(url: string, body?: any, headers?: any) {
    const request = this.makeRequest(HttpMethod.PUT, url, body);
    return this.do<T>({ ...request, headers });
  }

  /**
   * Makes a patch request
   * @param url absolute URL
   * @param body request body payload
   * @param headers custom headers to set
   */
  patch<T = any>(url: string, body?: any, headers?: any) {
    const request = this.makeRequest(HttpMethod.PATCH, url, body);
    return this.do<T>({ ...request, headers });
  }

  /**
   * Makes a delete request
   * @param url absolute URL
   * @param headers custom headers to set
   */
  del<T = any>(url: string, headers?: any) {
    const request = this.makeRequest(HttpMethod.DELETE, url);
    return this.do<T>({ ...request, headers });
  }
}
