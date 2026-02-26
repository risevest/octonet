import { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import Bunyan, { ERROR, INFO } from "bunyan";
import { Request, Response } from "express";

import { TracingProvider } from "../tracing";

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
  buffer?: NodeJS.WritableStream | Bunyan.WriteFn;
  tracing?: TracingProvider;
}

export class Logger {
  private logger: Bunyan;
  private tracing?: TracingProvider;

  constructor(logger: Bunyan, tracing?: TracingProvider);
  constructor(config: LoggerConfig);
  constructor(config: LoggerConfig | Bunyan, tracing?: TracingProvider) {
    if (config instanceof Bunyan) {
      this.logger = config;
      this.tracing = tracing;
    } else {
      this.tracing = config.tracing;
      this.logger = new Bunyan({
        name: config.name,
        serializers: config.serializers,
        streams: [
          {
            stream: config.buffer || process.stdout,
            level: config.verbose === false ? ERROR : INFO,
            type: !!config.buffer ? "raw" : "stream"
          }
        ]
      });
    }
  }

  private withTrace(data: object): object {
    if (!this.tracing) return data;
    const ctx = this.tracing.getActiveTraceContext();
    if (!ctx) return data;
    return { ...data, trace_id: ctx.traceId, span_id: ctx.spanId };
  }

  /**
   * Create a child logger with labels to annotate it as such
   * @param labels annotation of new sub logger
   */
  child(labels: object) {
    return new Logger(this.logger.child(labels), this.tracing);
  }

  /**
   * Logs an incoming HTTP request
   * @param req Express request
   */
  request(req: Request) {
    this.logger.info(this.withTrace({ req }));
  }

  /**
   * Logs an outgoing HTTP response
   * @param req Express request
   * @param res Express responser
   */
  response(req: Request, res: Response) {
    this.logger.info(this.withTrace({ res, req }));
  }

  /**
   * Logs an error that occured during the handling of an HTTP request
   * @param err Error object
   * @param req express request
   * @param res express responser
   */
  httpError(err: Error, req: Request, res: Response) {
    this.logger.error(this.withTrace({ err, res, req }));
  }

  /**
   * Logs an axios request
   * @param req Axios Request
   */
  axiosRequest(req: AxiosRequestConfig) {
    this.logger.info(this.withTrace({ axios_req: req }));
  }

  /**
   * Logs response to axios reequest
   * @param res Axios Response
   */
  axiosResponse(res: AxiosResponse) {
    this.logger.info(this.withTrace({ axios_req: res.config, axios_res: res }));
  }

  /**
   * Logs error response to axios request
   * @param err
   */
  axiosError(err: AxiosError) {
    this.logger.error(this.withTrace({ axios_req: err.response?.config || err.config, axios_res: err.response }));
  }

  /**
   * Log data
   * @param metadata data to be loggwed
   */
  log(metadata: object): void;
  /**
   * Logs data with a message
   * @param message message to be logged
   * @param metadata data to be logged
   */
  log(message: string, metadata?: object): void;
  log(entry: string | any, metadata?: object) {
    if (typeof entry === "string" && metadata) {
      this.logger.info(this.withTrace(metadata), entry);
    } else if (typeof entry === "string") {
      this.logger.info(this.withTrace({}), entry);
    } else {
      this.logger.info(this.withTrace(entry));
    }
  }

  /**
   * Log internal application error
   * @param err actual error being logged
   * @param extras anything else to log with the error
   */
  error(err: Error, extras?: object): void;
  /**
   * Log internal application error
   * @param err actual error being logged
   * @param message optional custom error message
   */
  error(err: Error, message?: string): void;
  error(err: Error, extras?: object | string) {
    if (typeof extras === "string") {
      this.logger.error(this.withTrace({ err }), extras);
    } else {
      this.logger.error(this.withTrace({ err, ...extras }));
    }
  }
}
