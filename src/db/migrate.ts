import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";

import { createSubmissionsSql } from "./migrations/001-create-submissions.js";
import { addSubmissionExpirySql } from "./migrations/002-add-submission-expiry.js";

const MIGRATION_LOCK_ID = "731459827105";

const migrations = [
  {
    version: 1,
    name: "create-submissions",
    sql: createSubmissionsSql,
  },
  {
    version: 2,
    name: "add-submission-expiry",
    sql: addSubmissionExpirySql,
  },
] as const;

type Migration = (typeof migrations)[number];
type AppliedMigration = { version: number; name: string; checksum: string };

function checksum(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

async function readAndValidateHistory(client: PoolClient): Promise<Set<number>> {
  const result = await client.query<AppliedMigration>(
    "SELECT version, name, checksum FROM schema_migrations ORDER BY version",
  );
  const known = new Map<number, Migration>(migrations.map((migration) => [migration.version, migration]));
  const applied = new Set<number>();

  for (const row of result.rows) {
    const migration = known.get(row.version);
    if (!migration || migration.name !== row.name || checksum(migration.sql) !== row.checksum) {
      throw new Error(`Recorded migration history does not match this build (version ${row.version})`);
    }
    applied.add(row.version);
  }

  for (const [index, version] of [...applied].sort((left, right) => left - right).entries()) {
    if (migrations[index]?.version !== version) {
      throw new Error(`Recorded migration history is not a registry prefix (version ${version})`);
    }
  }

  return applied;
}

export async function migrate(pool: Pool, timeoutMs: number): Promise<void> {
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    await client.query("SELECT set_config('statement_timeout', $1, false)", [String(timeoutMs)]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query("SELECT pg_advisory_lock($1::bigint)", [MIGRATION_LOCK_ID]);
    lockAcquired = true;

    const applied = await readAndValidateHistory(client);
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;

      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)",
          [migration.version, migration.name, checksum(migration.sql)],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    try {
      await client.query("RESET statement_timeout");
    } finally {
      try {
        if (lockAcquired) await client.query("SELECT pg_advisory_unlock($1::bigint)", [MIGRATION_LOCK_ID]);
      } finally {
        client.release();
      }
    }
  }
}
