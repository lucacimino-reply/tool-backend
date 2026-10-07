import { Pool } from "pg";

export function createPool(databaseUrl: string, connectionTimeoutMs: number): Pool {
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: connectionTimeoutMs,
  });

  pool.on("error", (error: Error) => {
    console.error("Unexpected error on an idle PostgreSQL connection.", error);
  });

  return pool;
}
