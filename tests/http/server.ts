import { Server } from "http";

import express, { Application } from "express";
import multer from "multer";

import { sleep } from "../helpers";

export interface TestRequest {
  method: string;
  headers: any;
  body?: any;
  query?: any;
  token?: string;
}

export function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  const uploads = multer();

  app.get("/test", (req, res) => {
    return res.json({ method: req.method, headers: req.headers, query: req.query });
  });

  app.delete("/test", (req, res) => {
    return res.json({ method: req.method, headers: req.headers, query: req.query });
  });

  app.get("/test/timeout", async (req, res) => {
    await sleep(1000);
    return res.json({ method: req.method, headers: req.headers, query: req.query });
  });

  app.get("/test/error", (_req, res) => {
    return res.status(422).json({ message: "an error occurred" });
  });

  app.post("/test", uploads.none(), (req, res) => {
    return res.json({ method: req.method, headers: req.headers, body: req.body });
  });

  app.get("/auth", (req, res) => {
    if (req.headers.authorization && /^Bearer/.test(req.headers.authorization?.trim())) {
      const auth = req.headers.authorization?.split(" ");
      return res.json({ method: req.method, headers: req.headers, body: req.body, token: auth?.[1] });
    } else {
      res.status(401).json({ msg: "No authorization header set" });
    }
  });

  app.use((_req, res, _next) => {
    return res.status(404).json({ msg: "resource not found" });
  });

  return app;
}

export function startServer(app: Application) {
  return new Promise<[Server, number]>((resolve, reject) => {
    const server = app.listen(() => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Could not get port for server"));
        return;
      }

      resolve([server, addr.port]);
    });
  });
}

export const stopServer = server =>
  new Promise((resolve, reject) => {
    server.close(err => {
      if (err) return reject(err);
      return resolve("Server shut down gracefully.");
    });
  });
