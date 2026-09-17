import { Pool } from 'pg';

import { config } from '../config/config.js';

export function createPool(connectionString = config.DATABASE_URL): Pool {
  return new Pool({ connectionString });
}
