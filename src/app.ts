import express, { type ErrorRequestHandler } from "express";

import { createContactsRouter } from "./features/contacts/contacts.routes.js";
import type { ServerError, SubmissionRepository } from "./features/contacts/contacts.types.js";

export function createApp(repository: SubmissionRepository) {
  const app = express();
  app.use(express.json({ limit: "2kb" }));
  app.use("/", (request, response, next) => {
    if (request.method === "POST" && request.path === "/submissions" && !request.is("application/json")) {
      response.status(400).json({ errors: { name: "Request must be JSON." } });
      return;
    }
    next();
  });
  app.use(createContactsRouter(repository));

  const requestBodyErrorHandler: ErrorRequestHandler = (error, _request, response, next) => {
    if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.too.large") {
      response.status(400).json({
        errors: {
          name: "Request body is too large.",
          email: "Request body is too large.",
        },
      });
      return;
    }
    if (error instanceof SyntaxError && "body" in error) {
      response.status(400).json({ errors: { name: "Request body must be valid JSON." } });
      return;
    }
    next(error);
  };
  app.use(requestBodyErrorHandler);
  app.use((_request, response) => {
    const error: ServerError = { message: "Not found." };
    response.status(404).json(error);
  });
  return app;
}
