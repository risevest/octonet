import { AxiosRequestConfig, AxiosResponse } from "axios";
import unset from "lodash/unset";

export function requestSerializer(...paths: string[]) {
  return (conf: AxiosRequestConfig) => {
    const log = { method: conf.method, url: conf.url, headers: conf.headers };

    if (conf.data && Object.keys(conf.data).length !== 0) {
      const logBody = { ...conf.data };
      paths.forEach(p => unset(logBody, p));

      log["data"] = logBody;
    }

    return log;
  };
}

export function responseSerializer(res: AxiosResponse<any>) {
  return {
    statusCode: res.status,
    headers: res.headers,
    body: res.data
  };
}
