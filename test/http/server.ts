import express, { Application } from "express";
import { Server } from "http";
import { sleep } from "../helpers";

export interface TestRequest {
  method: string;
  headers: any;
  body?: any;
  params?: any;
  token?: string;
}

export function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.get("/test", (req, res) => {
    return res.json({ method: req.method, headers: req.headers, params: req.params });
  });

  app.get("/test/timeout", async (req, res) => {
    await sleep(1000);
    return res.json({ method: req.method, headers: req.headers, params: req.params });
  });

  app.get("/test/error", (req, res) => {
    return res.status(422).json({ message: "an error occurred" });
  });

  app.post("/test", (req, res) => {
    return res.json({ method: req.method, headers: req.headers, body: req.body });
  });

  app.get("/auth", (req, res) => {
    if (/^Bearer/.test(req.headers.authorization?.trim())) {
      const auth = req.headers.authorization.split(" ");
      return res.json({ method: req.method, headers: req.headers, body: req.body, token: auth[1] });
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
      if (typeof addr === "string") {
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
