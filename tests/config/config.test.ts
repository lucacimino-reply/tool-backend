import { describe, expect, it } from 'vitest';

import { parseConfig } from '../../src/config/config.js';

describe('parseConfig', () => {
  it('accepts PostgreSQL connection URLs', () => {
    expect(parseConfig({ DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/clean' }).DATABASE_URL)
      .toBe('postgresql://postgres:postgres@localhost:5432/clean');
  });

  it('uses a bounded migration-lock timeout', () => {
    expect(parseConfig({ DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/clean' }).MIGRATION_LOCK_TIMEOUT_MS)
      .toBe(30_000);
    expect(() => parseConfig({ DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/clean', MIGRATION_LOCK_TIMEOUT_MS: '999' }))
      .toThrow('MIGRATION_LOCK_TIMEOUT_MS');
  });

  it('rejects non-PostgreSQL connection URLs without echoing their value', () => {
    const databaseUrl = 'https://credential.example.test/secret';
    expect(() => parseConfig({ DATABASE_URL: databaseUrl })).toThrow('DATABASE_URL: must use the postgres:// or postgresql:// protocol');
    expect(() => parseConfig({ DATABASE_URL: databaseUrl })).not.toThrow(databaseUrl);
  });
});
