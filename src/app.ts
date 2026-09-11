import express from "express";

import { createContactSubmissionRouter } from "./features/contact-submissions/contact-submissions.routes.js";
import type { ContactSubmissionRepository } from "./features/contact-submissions/contact-submissions.repository.js";

export function createApp(repository: ContactSubmissionRepository): express.Express {
  const app = express();

  app.use(express.json({ limit: "16kb", type: "application/json" }));
  app.use(createContactSubmissionRouter(repository));
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof SyntaxError || (typeof error === "object" && error !== null && "type" in error)) {
      response.status(422).json({ errors: {} });
      return;
    }

    console.error("Unexpected request processing failure.", error);
    response.status(500).json({ message: "Unable to process submission." });
  });

  return app;
}
