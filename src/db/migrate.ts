import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Pool, PoolClient } from "pg";

import { getConfig } from "../config/environment.js";
import { createPool } from "./pool.js";

type Migration = { identifier: number; filename: string; sql: string; checksum: string };
type AppliedMigration = { identifier: number; filename: string; checksum: string };

const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), "migrations");
const migrationFilePattern = /^(\d+)-[a-z0-9-]+\.sql$/;
const retryDelayMs = 500;

async function loadMigrations(): Promise<Migration[]> {
  const files = (await readdir(migrationsDirectory)).sort();
  const migrations = await Promise.all(
    files.map(async (filename) => {
      const match = migrationFilePattern.exec(filename);
      if (!match) {
        throw new Error(`Invalid migration filename: ${filename}`);
      }
      const sql = await readFile(join(migrationsDirectory, filename), "utf8");
      return {
        identifier: Number(match[1]),
        filename,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    }),
  );

  if (new Set(migrations.map((migration) => migration.identifier)).size !== migrations.length) {
    throw new Error("Migration identifiers must be unique.");
  }
  return migrations;
}

async function ensureHistoryTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      identifier INTEGER PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function applyMigrations(pool: Pool, migrations: Migration[]): Promise<void> {
  const client = await pool.connect();
  try {
    await ensureHistoryTable(client);
    await client.query("SELECT pg_advisory_lock($1)", [4_018_221]);
    const applied = await client.query<AppliedMigration>(
      "SELECT identifier, filename, checksum FROM schema_migrations ORDER BY identifier",
    );
    const byIdentifier = new Map(applied.rows.map((migration) => [migration.identifier, migration]));

    for (const historical of applied.rows) {
      const local = migrations.find((migration) => migration.identifier === historical.identifier);
      if (!local || local.filename !== historical.filename || local.checksum !== historical.checksum) {
        throw new Error(`Applied migration integrity check failed: ${historical.filename}`);
      }
    }

    for (const migration of migrations) {
      if (byIdentifier.has(migration.identifier)) {
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO schema_migrations (identifier, filename, checksum) VALUES ($1, $2, $3)",
          [migration.identifier, migration.filename, migration.checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [4_018_221]);
    } finally {
      client.release();
    }
  }
}

export async function runMigrations(pool: Pool): Promise<void> {
  const migrations = await loadMigrations();
  await applyMigrations(pool, migrations);
}

export async function waitForMigrations(pool: Pool, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await runMigrations(pool);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  throw new Error("Database connection or migration failed before timeout.", { cause: lastError });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = createPool();
  waitForMigrations(pool, getConfig().migrationTimeoutMs)
    .then(() => pool.end())
    .catch(async (error: unknown) => {
      console.error(error);
      await pool.end();
      process.exitCode = 1;
    });
}
