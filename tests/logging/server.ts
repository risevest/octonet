import express, { NextFunction, Request, Response } from "express";

import { Logger } from "../../src";

export function createLoggingApp(logger: Logger) {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get("/req", (req, res) => {
    logger.request(req);
    res.json({ message: "Logged" });
  });

  app.post("/req", (req, res) => {
    res.locals.body = req.body;
    logger.request(req);
    res.json(req.body);
  });

  app.get("/req-res", (req, res) => {
    logger.response(req, res);
    res.json({ message: "Logged" });
  });

  app.post("/req-res", (req, res) => {
    res.locals.body = req.body;
    logger.response(req, res);
    res.json(req.body);
  });

  app.get("/error", (_req, _res) => {
    throw new Error("Error");
  });

  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.httpError(err, req, res);
    res.json({ message: "Logged" });
  });

  return app;
}
