import type { Pool } from 'pg';

import { getSession } from './auth.service.js';
import type { AuthenticatedCustomer } from './auth.types.js';

export function getAuthenticatedSession(pool: Pool, token: string | undefined): Promise<AuthenticatedCustomer | undefined> {
  return getSession(pool, token);
}
