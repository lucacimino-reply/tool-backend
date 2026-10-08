import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";

import type { Pool } from "pg";

import { createApp } from "../src/app.js";
import { PostgresSubmissionStore } from "../src/features/submissions/submissions.repository.js";
import type {
  Submission,
  SubmissionInput,
  SubmissionStore,
} from "../src/features/submissions/submissions.types.js";

class MemorySubmissionStore implements SubmissionStore {
  private readonly rows: Submission[] = [];
  private readonly capacity = 100;
  private readonly windowMs = 60 * 60 * 1000;
  private nextId = 1;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly clock: () => Date) {}

  async createWithinCapacity(input: SubmissionInput): Promise<Submission | null> {
    const previous = this.queue;
    let release = (): void => undefined;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    try {
      const now = this.clock();
      const windowStart = now.getTime() - this.windowMs;
      const recentCount = this.rows.filter((row) => row.createdAt.getTime() > windowStart).length;
      if (recentCount >= this.capacity) {
        return null;
      }

      const submission: Submission = {
        ...input,
        id: String(this.nextId++),
        createdAt: now,
      };
      this.rows.push(submission);
      return submission;
    } finally {
      release();
    }
  }

  all(): Submission[] {
    return [...this.rows];
  }
}

class IsolatedPostgresPool {
  private readonly rows: Submission[] = [];
  private readonly windowMs = 60 * 60 * 1000;
  private nextId = 1;
  private lockQueue: Promise<void> = Promise.resolve();

  constructor(private readonly clock: () => Date) {}

  asPool(): Pool {
    return { connect: async () => this.connect() } as unknown as Pool;
  }

  all(): Submission[] {
    return [...this.rows];
  }

  private async connect() {
    const thisPool = this;
    let pending: Submission | undefined;
    let releaseAdvisoryLock: (() => void) | undefined;

    return {
      async query(text: string, values?: unknown[]) {
        if (text === "BEGIN") {
          pending = undefined;
          return { rows: [] };
        }
        if (text.includes("pg_advisory_xact_lock")) {
          const previous = thisPool.lockQueue;
          let unlock = (): void => undefined;
          thisPool.lockQueue = new Promise<void>((resolve) => {
            unlock = resolve;
          });
          await previous;
          releaseAdvisoryLock = unlock;
          return { rows: [] };
        }
        if (text.includes("clock_timestamp()")) {
          return { rows: [{ now: thisPool.clock() }] };
        }
        if (text.includes("COUNT(*)")) {
          const windowStart = values?.[0] as Date;
          const count = thisPool.rows.filter((row) => row.createdAt > windowStart).length;
          return { rows: [{ count: String(count) }] };
        }
        if (text.includes("INSERT INTO submissions")) {
          const [name, email, createdAt] = values as [string, string, Date];
          pending = { id: String(thisPool.nextId++), name, email, createdAt };
          return {
            rows: [
              {
                id: pending.id,
                name: pending.name,
                email: pending.email,
                created_at: pending.createdAt,
              },
            ],
          };
        }
        if (text === "COMMIT") {
          if (pending !== undefined) {
            thisPool.rows.push(pending);
          }
          pending = undefined;
          releaseAdvisoryLock?.();
          releaseAdvisoryLock = undefined;
          return { rows: [] };
        }
        if (text === "ROLLBACK") {
          pending = undefined;
          releaseAdvisoryLock?.();
          releaseAdvisoryLock = undefined;
          return { rows: [] };
        }
        return { rows: [] };
      },
      release() {
        releaseAdvisoryLock?.();
      },
    };
  }
}

async function withServer(store: SubmissionStore, run: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = createApp(store);
  const server = app.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function postSubmission(baseUrl: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/submissions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function postRawBody(baseUrl: string, body: string, contentType: string): Promise<Response> {
  return fetch(`${baseUrl}/api/submissions`, {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

function requestBodyWithByteLength(length: number): string {
  const prefix = '{"name":"Alex","email":"alex@example.com","padding":"';
  const suffix = '"}';
  const paddingLength = length - Buffer.byteLength(prefix) - Buffer.byteLength(suffix);
  assert.ok(paddingLength >= 0);
  return `${prefix}${"x".repeat(paddingLength)}${suffix}`;
}

function json(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

test("stores distinct duplicate submissions and returns submitted values unchanged", async () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const store = new MemorySubmissionStore(() => now);

  await withServer(store, async (baseUrl) => {
    const values = { name: "  Ada Lovelace  ", email: "Ada@example.com" };
    const first = await postSubmission(baseUrl, values);
    const second = await postSubmission(baseUrl, values);

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    const firstBody = await json(first);
    const secondBody = await json(second);
    const firstSubmission = firstBody.submission as Record<string, unknown>;
    const secondSubmission = secondBody.submission as Record<string, unknown>;
    assert.equal(firstSubmission.name, values.name);
    assert.equal(firstSubmission.email, values.email);
    assert.notEqual(firstSubmission.id, secondSubmission.id);
    assert.equal(store.all().length, 2);
  });
});

test("accepts name and email character-count boundaries", async () => {
  const store = new MemorySubmissionStore(() => new Date("2026-01-01T00:00:00.000Z"));
  const email254 = `${"a".repeat(242)}@example.com`;
  assert.equal(Array.from(email254).length, 254);

  await withServer(store, async (baseUrl) => {
    for (const name of ["A", "N".repeat(100)]) {
      assert.equal((await postSubmission(baseUrl, { name, email: "alex@example.com" })).status, 201);
    }
    assert.equal((await postSubmission(baseUrl, { name: "Alex", email: email254 })).status, 201);
    assert.equal(store.all().length, 3);
  });
});

test("rejects invalid fields before calling storage", async () => {
  const store = new MemorySubmissionStore(() => new Date("2026-01-01T00:00:00.000Z"));
  const invalidBodies: unknown[] = [
    { email: "alex@example.com" },
    { name: "Alex" },
    { name: "", email: "alex@example.com" },
    { name: "N".repeat(101), email: "alex@example.com" },
    { name: "Alex", email: "not-an-email" },
    { name: "Alex", email: `${"a".repeat(243)}@example.com` },
  ];

  await withServer(store, async (baseUrl) => {
    for (const body of invalidBodies) {
      const response = await postSubmission(baseUrl, body);
      assert.equal(response.status, 400);
      const responseBody = await json(response);
      const error = responseBody.error as { code: string; fields: Record<string, string> };
      assert.equal(error.code, "VALIDATION_FAILED");
      assert.ok(Object.keys(error.fields).length > 0);
      if (body === invalidBodies[4]) {
        assert.equal(error.fields.email, "Enter a valid email address, like alex@example.com.");
      }
    }
    assert.equal(store.all().length, 0);
  });
});

test("enforces the JSON byte limit before submission storage", async () => {
  let storageCalls = 0;
  const store: SubmissionStore = {
    async createWithinCapacity(input) {
      storageCalls += 1;
      return { ...input, id: String(storageCalls), createdAt: new Date("2026-01-01T00:00:00.000Z") };
    },
  };

  await withServer(store, async (baseUrl) => {
    const atLimit = await postRawBody(baseUrl, requestBodyWithByteLength(16 * 1024), "application/json");
    assert.equal(atLimit.status, 201);
    assert.equal(storageCalls, 1);

    const overLimit = await postRawBody(baseUrl, requestBodyWithByteLength(16 * 1024 + 1), "application/json");
    assert.equal(overLimit.status, 413);
    assert.deepEqual(await json(overLimit), { error: { code: "REQUEST_TOO_LARGE" } });
    assert.equal(storageCalls, 1);
  });
});

test("rejects non-JSON submissions before parsing or storage", async () => {
  let storageCalls = 0;
  const store: SubmissionStore = {
    async createWithinCapacity(input) {
      storageCalls += 1;
      return { ...input, id: String(storageCalls), createdAt: new Date("2026-01-01T00:00:00.000Z") };
    },
  };

  await withServer(store, async (baseUrl) => {
    const response = await postRawBody(baseUrl, requestBodyWithByteLength(16 * 1024 + 1), "text/plain");
    assert.equal(response.status, 415);
    assert.deepEqual(await json(response), { error: { code: "UNSUPPORTED_MEDIA_TYPE" } });
    assert.equal(storageCalls, 0);
  });
});

test("rejects malformed JSON before submission storage", async () => {
  let storageCalls = 0;
  const store: SubmissionStore = {
    async createWithinCapacity(input) {
      storageCalls += 1;
      return { ...input, id: String(storageCalls), createdAt: new Date("2026-01-01T00:00:00.000Z") };
    },
  };

  await withServer(store, async (baseUrl) => {
    const response = await postRawBody(baseUrl, '{"name":', "application/json");
    assert.equal(response.status, 400);
    assert.deepEqual(await json(response), { error: { code: "INVALID_JSON" } });
    assert.equal(storageCalls, 0);
  });
});

test("uses the rolling-hour boundary and rejects the 101st successful submission", async () => {
  let now = new Date("2026-01-01T00:00:00.000Z");
  const store = new MemorySubmissionStore(() => now);

  await withServer(store, async (baseUrl) => {
    for (let index = 0; index < 100; index += 1) {
      assert.equal((await postSubmission(baseUrl, { name: `Visitor ${index}`, email: "same@example.com" })).status, 201);
    }

    const rejected = await postSubmission(baseUrl, { name: "Over capacity", email: "same@example.com" });
    assert.equal(rejected.status, 429);
    const invalidWhileFull = await postSubmission(baseUrl, { name: "", email: "same@example.com" });
    assert.equal(invalidWhileFull.status, 400);
    assert.equal(store.all().length, 100);

    now = new Date(now.getTime() + 60 * 60 * 1000);
    const afterWindow = await postSubmission(baseUrl, { name: "Capacity returned", email: "same@example.com" });
    assert.equal(afterWindow.status, 201);
    assert.equal(store.all().length, 101);
  });
});

test("concurrent PostgreSQL-backed submissions cannot exceed service-wide capacity", async () => {
  const database = new IsolatedPostgresPool(() => new Date("2026-01-01T00:00:00.000Z"));
  const store = new PostgresSubmissionStore(database.asPool());

  await withServer(store, async (baseUrl) => {
    const responses = await Promise.all(
      Array.from({ length: 150 }, (_, index) =>
        postSubmission(baseUrl, { name: `Visitor ${index}`, email: "same@example.com" }),
      ),
    );
    assert.equal(responses.filter((response) => response.status === 201).length, 100);
    assert.equal(responses.filter((response) => response.status === 429).length, 50);
    assert.equal(database.all().length, 100);
  });
});

test("storage failures return a non-success response", async () => {
  const store: SubmissionStore = {
    async createWithinCapacity() {
      throw new Error("database unavailable");
    },
  };
  const originalError = console.error;
  console.error = () => undefined;

  try {
    await withServer(store, async (baseUrl) => {
      const response = await postSubmission(baseUrl, { name: "Alex", email: "alex@example.com" });
      assert.equal(response.status, 500);
      assert.deepEqual(await json(response), { error: { code: "SUBMISSION_FAILED" } });
    });
  } finally {
    console.error = originalError;
  }
});

test("PostgreSQL persistence locks capacity, counts only the rolling window, then commits the row", async () => {
  const statements: string[] = [];
  const queries: Array<{ text: string; values?: unknown[] }> = [];
  const now = new Date("2026-01-01T00:00:00.000Z");
  const client = {
    async query(text: string, values?: unknown[]) {
      statements.push(text.replace(/\s+/g, " ").trim());
      queries.push({ text, values });
      if (text.includes("clock_timestamp()")) {
        return { rows: [{ now }] };
      }
      if (text.includes("COUNT(*)")) {
        return { rows: [{ count: "0" }] };
      }
      if (text.includes("INSERT INTO submissions")) {
        return { rows: [{ id: "1", name: "Alex", email: "alex@example.com", created_at: now }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const pool = { connect: async () => client } as unknown as Pool;
  const store = new PostgresSubmissionStore(pool);

  const saved = await store.createWithinCapacity({ name: "Alex", email: "alex@example.com" });
  assert.deepEqual(saved, { id: "1", name: "Alex", email: "alex@example.com", createdAt: now });
  const lockIndex = statements.findIndex((statement) => statement.includes("pg_advisory_xact_lock"));
  const clockIndex = statements.findIndex((statement) => statement.includes("clock_timestamp()"));
  const countIndex = statements.findIndex((statement) => statement.includes("COUNT(*)"));
  const insertIndex = statements.findIndex((statement) => statement.startsWith("INSERT INTO submissions"));
  const commitIndex = statements.findIndex((statement) => statement === "COMMIT");
  assert.ok(lockIndex >= 0 && lockIndex < clockIndex);
  assert.ok(clockIndex < countIndex && countIndex < insertIndex && insertIndex < commitIndex);
  const countQuery = queries.find((query) => query.text.includes("COUNT(*)"));
  assert.deepEqual(countQuery?.values, [new Date(now.getTime() - 60 * 60 * 1000)]);
  const insertQuery = queries.find((query) => query.text.includes("INSERT INTO submissions"));
  assert.deepEqual(insertQuery?.values, ["Alex", "alex@example.com", now]);
});

test("PostgreSQL write failures roll back and cannot return a saved submission", async () => {
  const statements: string[] = [];
  const client = {
    async query(text: string) {
      statements.push(text.replace(/\s+/g, " ").trim());
      if (text.includes("clock_timestamp()")) {
        return { rows: [{ now: new Date("2026-01-01T00:00:00.000Z") }] };
      }
      if (text.includes("COUNT(*)")) {
        return { rows: [{ count: "0" }] };
      }
      if (text.includes("INSERT INTO submissions")) {
        throw new Error("write rejected");
      }
      return { rows: [] };
    },
    release() {},
  };
  const pool = { connect: async () => client } as unknown as Pool;
  const store = new PostgresSubmissionStore(pool);

  await assert.rejects(store.createWithinCapacity({ name: "Alex", email: "alex@example.com" }), /write rejected/);
  assert.ok(statements.includes("ROLLBACK"));
  assert.ok(!statements.includes("COMMIT"));
});
