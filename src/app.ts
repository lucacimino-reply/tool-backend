import express, { type ErrorRequestHandler } from "express";

import { createSubmissionRouter } from "./features/submissions/submissions.routes.js";
import type { SubmissionStore } from "./features/submissions/submissions.types.js";

const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  const cause = error as { type?: string };
  if (cause.type === "entity.too.large") {
    response.status(413).json({ error: { code: "REQUEST_TOO_LARGE" } });
    return;
  }
  if (cause.type === "entity.parse.failed") {
    response.status(400).json({ error: { code: "INVALID_JSON" } });
    return;
  }

  console.error("Unhandled request failure.", error);
  response.status(500).json({ error: { code: "REQUEST_FAILED" } });
};

export function createApp(store: SubmissionStore): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb", strict: true }));
  app.use(createSubmissionRouter(store));
  app.use(errorHandler);
  return app;
}
