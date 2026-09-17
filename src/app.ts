import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { Pool } from 'pg';

import { createAuthRouter } from './features/auth/auth.routes.js';

export function createApp(pool: Pool, options: { sessionDurationHours: number; secureCookies: boolean }) {
  const app = express();
  app.use(express.json({ limit: '16kb', type: 'application/json' }));
  app.use(cookieParser());
  app.use('/api', createAuthRouter(pool, options));
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
      response.status(422).json({
        code: 'validation_error',
        message: 'One or more fields are invalid.',
        fieldErrors: { body: 'Request body must be at most 16kb.' },
      });
      return;
    }
    if (error instanceof SyntaxError && 'body' in error) {
      response.status(422).json({ code: 'validation_error', message: 'One or more fields are invalid.', fieldErrors: { body: 'Request body must be valid JSON.' } });
      return;
    }
    console.error('Unhandled server error', error);
    response.status(500).json({ code: 'internal_error', message: 'The operation could not be completed.' });
  });
  return app;
}
