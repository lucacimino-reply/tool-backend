import express, { type ErrorRequestHandler } from "express";

import { createContactRoutes } from "./features/contacts/contacts.routes.js";
import type { SubmissionRepository } from "./features/contacts/contacts.types.js";

type RequestError = Error & { status?: number; type?: string };

export function createApp(repository: SubmissionRepository, logError: (error: unknown) => void = console.error) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));
  app.use("/api/submissions", createContactRoutes(repository));

  const errorHandler: ErrorRequestHandler = (error: RequestError, _request, response, _next) => {
    if (error.type === "entity.parse.failed") {
      response.status(400).json({ error: "invalid_json" });
      return;
    }
    if (error.type === "entity.too.large") {
      response.status(413).json({ error: "request_too_large" });
      return;
    }

    logError(error);
    response.status(500).json({ error: "submission_failed" });
  };
  app.use(errorHandler);

  return app;
}
