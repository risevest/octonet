import Bunyan, { FATAL, INFO, Serializers } from "bunyan";
import { Request, Response } from "express";
import { unset } from "lodash";

/**
 * Creates bunyan serializer for express requests
 * @param paths sensitive data pasths
 */
export function createRequestSerializer(...paths: string[]): (req: Request) => object {
  return (req: Request) => {
    if (!req || !req.socket) return req;

    const log = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      remoteAddress: req.socket.remoteAddress,
      remotePort: req.socket.remotePort
    };

    if (req.body && Object.keys(req.body).length !== 0) {
      // sanitize first`
      const logBody = { ...req.body };
      paths.forEach(p => unset(logBody, p));

      log["body"] = logBody;
    }

    return log;
  };
}

/**
 * bunyan serializer for express responses
 * @param res express response object
 */
function resSerializer(res: Response) {
  if (!res || !res.statusCode) return res;

  return {
    statusCode: res.statusCode,
    headers: res.getHeaders(),
    body: res.locals.body
  };
}

export function defaultSerializers(serializers: Serializers = null, ...paths: string[]): Serializers {
  return {
    ...serializers,
    res: resSerializer,
    req: createRequestSerializer(...paths)
  };
}

export interface LogError {
  err: Error;
  [key: string]: any;
}

export class Logger {
  private logger: Bunyan;
  public ringbuffer;

  constructor(name: string, env = "dev", serializers: Serializers) {
    this.ringbuffer = new Bunyan.RingBuffer({ limit: 100 });

    this.logger = new Bunyan({
      name,
      serializers,
      level: env === "test" ? FATAL : INFO,
      streams: [
        {
          stream: this.ringbuffer
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
  error(entry: string | LogError) {
    this.logger.error(entry);
  }
}
