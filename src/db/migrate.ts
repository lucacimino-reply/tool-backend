import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Pool, PoolClient } from "pg";

import { getConfig } from "../config/env.js";
import { createPool } from "./pool.js";

type Migration = {
  checksum: string;
  filename: string;
  id: number;
  sql: string;
};

const MIGRATION_FILE = /^(\d+)-[a-z0-9-]+\.sql$/;
const LOCK_ID = 4_286_319;

async function loadMigrations(): Promise<Migration[]> {
  const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), "migrations");
  const filenames = await readdir(migrationsDirectory);
  const migrations = await Promise.all(
    filenames.map(async (filename) => {
      const match = MIGRATION_FILE.exec(filename);
      if (!match) {
        throw new Error(`Invalid migration filename: ${filename}`);
      }

      const sql = await readFile(join(migrationsDirectory, filename), "utf8");
      return {
        checksum: createHash("sha256").update(sql).digest("hex"),
        filename,
        id: Number(match[1]),
        sql,
      };
    }),
  );

  migrations.sort((left, right) => left.filename.localeCompare(right.filename));
  const ids = new Set<number>();
  for (const migration of migrations) {
    if (!Number.isSafeInteger(migration.id) || ids.has(migration.id)) {
      throw new Error(`Duplicate or invalid migration identifier: ${migration.filename}`);
    }
    ids.add(migration.id);
  }

  return migrations;
}

async function createHistoryTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGINT PRIMARY KEY,
      filename TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function applyMigrations(pool: Pool): Promise<void> {
  const migrations = await loadMigrations();
  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
    await createHistoryTable(client);
    const applied = await client.query<{ id: string; filename: string; checksum: string }>(
      "SELECT id, filename, checksum FROM schema_migrations ORDER BY id",
    );
    const appliedById = new Map(applied.rows.map((migration) => [Number(migration.id), migration]));
    const migrationsById = new Map(migrations.map((migration) => [migration.id, migration]));

    for (const migration of applied.rows) {
      if (!migrationsById.has(Number(migration.id))) {
        throw new Error(`Applied migration is missing from the application: ${migration.filename}`);
      }
    }

    for (const migration of migrations) {
      const prior = appliedById.get(migration.id);
      if (prior) {
        if (prior.filename !== migration.filename || prior.checksum !== migration.checksum) {
          throw new Error(`Applied migration does not match: ${migration.filename}`);
        }
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO schema_migrations (id, filename, checksum) VALUES ($1, $2, $3)",
          [migration.id, migration.filename, migration.checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]);
    } finally {
      client.release();
    }
  }
}

async function connectWithRetry(pool: Pool, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const client = await pool.connect();
      client.release();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }

  throw new Error("Timed out connecting to PostgreSQL.", { cause: lastError });
}

async function main(): Promise<void> {
  const config = getConfig();
  const pool = createPool(config.databaseUrl);
  try {
    await connectWithRetry(pool, config.migrationTimeoutMs);
    await applyMigrations(pool);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error("Database migration failed.", error);
    process.exitCode = 1;
  });
}
