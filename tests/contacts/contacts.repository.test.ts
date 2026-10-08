import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

import { createSubmissionRepository } from "../../src/features/contacts/contacts.repository.js";
import type { NewSubmission, StoredSubmission } from "../../src/features/contacts/contacts.types.js";

const WINDOW_MS = 60 * 60 * 1000;

class FakePostgres {
  readonly rows: StoredSubmission[] = [];
  now = new Date("2026-10-08T12:00:00.000Z");
  failNextInsert = false;
  private nextId = 1;
  private lockTail: Promise<void> = Promise.resolve();

  async acquireLock(): Promise<() => void> {
    const previous = this.lockTail;
    let release = (): void => {};
    this.lockTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    return release;
  }

  nextSubmission(values: unknown[]): StoredSubmission {
    const [name, email, submittedAt] = values as [string, string, Date];
    return {
      id: String(this.nextId++),
      name,
      email,
      submittedAt: new Date(submittedAt),
    };
  }
}

function queryResult<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
}

class FakePool {
  constructor(private readonly database: FakePostgres) {}

  async connect(): Promise<PoolClient> {
    let unlock: (() => void) | undefined;
    let pending: StoredSubmission | undefined;
    let released = false;
    const unlockTransaction = (): void => {
      unlock?.();
      unlock = undefined;
    };
    const query = async <Row extends QueryResultRow>(sql: string, values: unknown[] = []): Promise<QueryResult<Row>> => {
      if (sql === "BEGIN") return queryResult<Row>([]);
      if (sql.includes("pg_advisory_xact_lock")) {
        unlock = await this.database.acquireLock();
        return queryResult<Row>([]);
      }
      if (sql.includes("clock_timestamp()")) {
        return queryResult<Row>([{ now: new Date(this.database.now) } as unknown as Row]);
      }
      if (sql.startsWith("SELECT count(*)")) {
        await Promise.resolve();
        const cutoff = (values[0] as Date).getTime() - WINDOW_MS;
        const count = this.database.rows.filter((row) => row.submittedAt.getTime() > cutoff).length;
        return queryResult<Row>([{ count: String(count) } as unknown as Row]);
      }
      if (sql.startsWith("INSERT INTO contact_submissions")) {
        if (this.database.failNextInsert) {
          this.database.failNextInsert = false;
          throw new Error("simulated database write failure");
        }
        pending = this.database.nextSubmission(values);
        return queryResult<Row>([pending as unknown as Row]);
      }
      if (sql === "COMMIT") {
        if (pending) this.database.rows.push(pending);
        unlockTransaction();
        return queryResult<Row>([]);
      }
      if (sql === "ROLLBACK") {
        pending = undefined;
        unlockTransaction();
        return queryResult<Row>([]);
      }
      throw new Error(`Unexpected SQL in repository test: ${sql}`);
    };

    return {
      query,
      release: () => {
        if (!released) unlockTransaction();
        released = true;
      },
    } as unknown as PoolClient;
  }
}

function makeRepository(database = new FakePostgres()) {
  const pool = new FakePool(database) as unknown as Pool;
  return { database, repository: createSubmissionRepository(pool) };
}

const submission: NewSubmission = { name: "Alex Example", email: "alex@example.com" };

test("PostgreSQL repository counts duplicates and enforces the rolling window under concurrency", async () => {
  const { database, repository } = makeRepository();
  const results = await Promise.all(
    Array.from({ length: 125 }, () => repository.createWithinCapacity(submission)),
  );

  assert.equal(results.filter(Boolean).length, 100);
  assert.equal(database.rows.length, 100);
  assert.equal(database.rows.every((row) => row.name === submission.name && row.email === submission.email), true);

  database.now = new Date(database.now.getTime() + WINDOW_MS);
  assert.ok(await repository.createWithinCapacity(submission));
  assert.equal(database.rows.length, 101);
});

test("PostgreSQL repository rolls back failed writes without consuming capacity", async () => {
  const { database, repository } = makeRepository();
  database.failNextInsert = true;

  await assert.rejects(repository.createWithinCapacity(submission), /simulated database write failure/);
  assert.equal(database.rows.length, 0);
  assert.ok(await repository.createWithinCapacity(submission));
  assert.equal(database.rows.length, 1);
});

test("PostgreSQL repository inserts duplicate submissions as distinct rows", async () => {
  const { database, repository } = makeRepository();

  const first = await repository.createWithinCapacity(submission);
  const second = await repository.createWithinCapacity(submission);

  assert.notEqual(first?.id, second?.id);
  assert.equal(database.rows.length, 2);
});
