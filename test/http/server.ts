import express, { Request, Response } from "express";

const app = express();

app.get("/", (req: Request, res: Response) => {
  res.status(200).json({ message: "Hello World" });
});

app.get("/auth", (req: Request, res: Response) => {
  if (req.headers["authorization"] === "Bearer") {
    res.status(200).json({ message: "authorized" });
  } else {
    throw new Error("No authorization header");
  }
});

export default app;
