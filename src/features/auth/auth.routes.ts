import { Router } from 'express';
import type { Pool } from 'pg';

import { createAuthController } from './auth.controller.js';

export function createAuthRouter(pool: Pool, options: { sessionDurationHours: number; secureCookies: boolean }): Router {
  const controller = createAuthController(pool, options);
  const router = Router();
  router.post('/auth/signup', controller.signUp);
  router.post('/auth/login', controller.logIn);
  router.get('/auth/session', controller.getSession);
  return router;
}
