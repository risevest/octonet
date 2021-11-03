import express = require("express");

const app = express();

export interface TestResponse {
  data: any;
  error: string[] | null;
}

app.get("/test", (req, res) => {
  const result: TestResponse = {
    data: { foo: "bar" },
    error: null
  };
  return res.json(result);
});

app.post("/test", (req, res) => {
  const result: TestResponse = {
    data: { foo: "bar" },
    error: null
  };
  return res.json(result);
});

app.put("/test/:id", (req, res) => {
  const result: TestResponse = {
    data: { foo: "bar" },
    error: null
  };
  return res.json(result);
});

app.patch("/test/:id", (req, res) => {
  const result: TestResponse = {
    data: { foo: "bar" },
    error: null
  };
  return res.json(result);
});

app.delete("/test/:id", (req, res) => {
  const result: TestResponse = {
    data: { foo: "bar" },
    error: null
  };
  return res.json(result);
});

app.get("/auth", (req, res) => {
  const result: TestResponse = {
    data: { foo: "bar" },
    error: null
  };

  if (req.headers["authorization"] === "Bearer") {
    res.json(result);
  } else {
    throw new Error("No authorization header");
  }
});

app.use((req, res, next) => {
  const result: TestResponse = {
    data: null,
    error: ["resource not found"]
  };
  return res.status(404).send(result);
});

export const startServer = (port: number) =>
  new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      return resolve(server);
    });
    server.on("error", err => reject(err));
  });

export const stopServer = server =>
  new Promise((resolve, reject) => {
    server.close(err => {
      if (err) return reject(err);
      return resolve("Server shut down gracefully.");
    });
  });
