import { createHash } from 'node:crypto';

import type { Pool, PoolClient } from 'pg';

import { sql as createAuth } from './migrations/001-create-auth.js';
import { sql as createPromotions } from './migrations/002-create-promotions.js';
import { sql as createCompletedBookings } from './migrations/003-create-completed-bookings.js';

const MIGRATION_LOCK_ID = 458_624_119;
const migrations = [
  { version: 1, name: 'create-auth', sql: createAuth },
  { version: 2, name: 'create-promotions', sql: createPromotions },
  { version: 3, name: 'create-completed-bookings', sql: createCompletedBookings },
];

function checksum(sql: string): string {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

export async function migrate(pool: Pool, lockTimeoutMs = 30_000): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('lock_timeout', $1, false)", [`${lockTimeoutMs}ms`]);
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    const recorded = await client.query<{ version: number; name: string; checksum: string }>(
      'SELECT version, name, checksum FROM schema_migrations ORDER BY version',
    );
    for (const applied of recorded.rows) {
      const migration = migrations.find((entry) => entry.version === applied.version);
      if (!migration || migration.name !== applied.name || checksum(migration.sql) !== applied.checksum) {
        throw new Error(`Migration history does not match registry at version ${applied.version}`);
      }
    }
    for (const migration of migrations.filter((entry) => !recorded.rows.some((row) => row.version === entry.version))) {
      await applyMigration(client, migration);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => undefined);
    client.release();
  }
}

async function applyMigration(client: PoolClient, migration: (typeof migrations)[number]): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(migration.sql);
    await client.query('INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)', [
      migration.version,
      migration.name,
      checksum(migration.sql),
    ]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
