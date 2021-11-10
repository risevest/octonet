import { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import Bunyan, { FATAL, INFO } from "bunyan";
import { Request, Response } from "express";

export interface LogError {
  err: Error;
  [key: string]: any;
}

type Serializer = (input: any) => any;
type Serializers = {
  [key: string]: Serializer;
};

export interface LoggerConfig {
  name: string;
  serializers: Serializers;
  verbose?: boolean;
  buffer?: NodeJS.WritableStream;
}

export class Logger {
  private logger: Bunyan;

  constructor(config: LoggerConfig) {
    this.logger = new Bunyan({
      name: config.name,
      serializers: config.serializers,
      level: config.verbose === true ? INFO : FATAL,
      streams: [
        {
          stream: config.buffer || process.stdout,
          level: config.verbose === false ? FATAL : INFO,
          type: !!config.buffer ? "raw" : "stream"
        }
      ]
    });
  }

  /**
   * Logs an incoming HTTP request
   * @param req Express request
   */
  request(req: Request) {
    this.logger.info({ req });
  }

  /**
   * Logs an outgoing HTTP response
   * @param req Express request
   * @param res Express responser
   */
  response(req: Request, res: Response) {
    this.logger.info({ res, req });
  }

  /**
   * Logs an error that occured during the handling of an HTTP request
   * @param err Error object
   * @param req express request
   * @param res express responser
   */
  httpError(err: Error, req: Request, res: Response) {
    this.logger.error({ err, res, req });
  }

  /**
   * Logs an axios request
   * @param req Axios Request
   */
  axiosRequest(req: AxiosRequestConfig) {
    this.logger.info({ axios_req: req });
  }

  /**
   * Logs response to axios reequest
   * @param res Axios Response
   */
  axiosResponse(res: AxiosResponse) {
    this.logger.info({ axios_req: res.config, axios_res: res });
  }

  /**
   * Logs error response to axios request
   * @param err
   */
  axiosError(err: AxiosError) {
    this.logger.error({ axios_req: err.response.config, axios_res: err.response });
  }

  /**
   * Simple message log
   * @param entry entry message to be logged
   */
  log(entry: string | object) {
    this.logger.info(entry);
  }

  /**
   * Log internal application error
   * @param message additional error description
   */
  error(message: string | LogError) {
    this.logger.error(message);
  }
}
