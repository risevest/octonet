import express from "express";
import { logger } from "./logging.spec";

const app = express();

app.get("/req", (req, res) => {
  logger.request(req);
  res.json({ message: "Logged" });
});

app.get("/req-res", (req, res) => {
  logger.response(req, res);
  res.json({ message: "Logged" });
});

app.get("/error", (req, res) => {
  throw new Error("Error");
});

app.use((err, req, res, next) => {
  logger.httpError(err, req, res);
  res.json({ message: "Logged" });
});

export default app;
