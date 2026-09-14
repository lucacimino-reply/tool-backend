import { Pool } from "pg";

import { getConfig } from "../config/environment.js";

export function createPool(): Pool {
  return new Pool({ connectionString: getConfig().databaseUrl });
}
