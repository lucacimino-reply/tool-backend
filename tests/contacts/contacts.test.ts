import assert from "node:assert/strict";
import { test } from "node:test";

import request from "supertest";

import { createApp } from "../../src/app.js";
import type {
  NewSubmission,
  StoredSubmission,
  SubmissionRepository,
} from "../../src/features/contacts/contacts.types.js";

const WINDOW_MS = 60 * 60 * 1000;
const RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

class InMemorySubmissionRepository implements SubmissionRepository {
  readonly rows: StoredSubmission[] = [];
  now = new Date("2026-10-08T12:00:00.000Z");
  failNextWrite = false;
  private nextId = 1;
  private tail: Promise<void> = Promise.resolve();

  async createWithinCapacity(submission: NewSubmission): Promise<StoredSubmission | null> {
    const previous = this.tail;
    let release = (): void => {};
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    try {
      const cutoff = this.now.getTime() - WINDOW_MS;
      const recent = this.rows.filter((row) => row.submittedAt.getTime() > cutoff).length;
      if (recent >= 100) return null;
      if (this.failNextWrite) {
        this.failNextWrite = false;
        throw new Error("simulated persistence failure");
      }

      const row: StoredSubmission = {
        id: String(this.nextId++),
        name: submission.name,
        email: submission.email,
        submittedAt: new Date(this.now),
        expiresAt: new Date(this.now.getTime() + RETENTION_MS),
      };
      this.rows.push(row);
      return row;
    } finally {
      release();
    }
  }

  async deleteExpired(): Promise<number> {
    const retained = this.rows.filter((row) => row.expiresAt.getTime() > this.now.getTime());
    const deleted = this.rows.length - retained.length;
    this.rows.splice(0, this.rows.length, ...retained);
    return deleted;
  }
}

function makeApp(repository = new InMemorySubmissionRepository()) {
  return { app: createApp(repository, () => {}), repository };
}

function validPair(overrides: Partial<NewSubmission> = {}): NewSubmission {
  return { name: "Alex Example", email: "alex@example.com", ...overrides };
}

function emailOfLength254(): string {
  return `${"l".repeat(64)}@${["a".repeat(63), "b".repeat(63), "c".repeat(61)].join(".")}`;
}

test("accepts and returns submitted values without normalization", async () => {
  const { app, repository } = makeApp();
  const submission = validPair({ name: "  Alex Example  ", email: "Alex@Example.com" });

  const response = await request(app).post("/api/submissions").send(submission);

  assert.equal(response.status, 201);
  assert.deepEqual(response.body, { submission });
  assert.deepEqual(repository.rows.map(({ name, email }) => ({ name, email })), [submission]);
});

test("reports missing, empty, and out-of-range fields without storing them", async () => {
  const { app, repository } = makeApp();
  const cases: Array<{ body: Record<string, unknown>; field: "name" | "email" }> = [
    { body: {}, field: "name" },
    { body: { name: "Alex" }, field: "email" },
    { body: { name: "", email: "alex@example.com" }, field: "name" },
    { body: { name: "n".repeat(101), email: "alex@example.com" }, field: "name" },
    { body: { name: "Alex", email: "not-an-email" }, field: "email" },
    { body: { name: "Alex", email: `${"a".repeat(250)}@example.com` }, field: "email" },
  ];

  for (const { body, field } of cases) {
    const response = await request(app).post("/api/submissions").send(body);
    assert.equal(response.status, 400);
    assert.equal(response.body.error, "validation_failed");
    assert.equal(typeof response.body.fields[field], "string");
  }
  const noBody = await request(app).post("/api/submissions");
  assert.equal(noBody.status, 400);
  assert.equal(typeof noBody.body.fields.name, "string");
  assert.equal(typeof noBody.body.fields.email, "string");
  assert.equal(repository.rows.length, 0);
});

test("rejects field and request-size limits before calling persistence", async () => {
  let persistenceCalls = 0;
  const repository: SubmissionRepository = {
    async createWithinCapacity(submission) {
      persistenceCalls += 1;
      const submittedAt = new Date();
      return {
        ...submission,
        id: String(persistenceCalls),
        submittedAt,
        expiresAt: new Date(submittedAt.getTime() + RETENTION_MS),
      };
    },
    async deleteExpired() {
      return 0;
    },
  };
  const app = createApp(repository, () => {});

  const overlongName = await request(app)
    .post("/api/submissions")
    .send(validPair({ name: "n".repeat(101) }));
  const overlongEmail = await request(app)
    .post("/api/submissions")
    .send(validPair({ email: `${"a".repeat(250)}@example.com` }));
  const oversizedJson = `${JSON.stringify(validPair())}${" ".repeat(16 * 1024)}`;
  const oversizedBody = await request(app)
    .post("/api/submissions")
    .set("Content-Type", "application/json")
    .send(oversizedJson);

  assert.equal(overlongName.status, 400);
  assert.equal(overlongName.body.fields.name, "Name must be at most 100 characters.");
  assert.equal(overlongEmail.status, 400);
  assert.equal(overlongEmail.body.fields.email, "Email must be at most 254 characters.");
  assert.equal(oversizedBody.status, 413);
  assert.deepEqual(oversizedBody.body, { error: "request_too_large" });
  assert.equal(persistenceCalls, 0);
});

test("accepts name lengths 1 and 100 and a valid 254-character email", async () => {
  const { app, repository } = makeApp();

  for (const submission of [
    validPair({ name: "n" }),
    validPair({ name: "n".repeat(100) }),
    validPair({ name: "😀".repeat(100) }),
    validPair({ email: emailOfLength254() }),
  ]) {
    const response = await request(app).post("/api/submissions").send(submission);
    assert.equal(response.status, 201);
    assert.deepEqual(response.body.submission, submission);
  }
  const tooManyUnicodeCharacters = await request(app)
    .post("/api/submissions")
    .send(validPair({ name: "😀".repeat(101) }));
  assert.equal(tooManyUnicodeCharacters.status, 400);
  assert.equal(repository.rows.length, 4);
});

test("stores repeated names, emails, and identical pairs as separate submissions", async () => {
  const { app, repository } = makeApp();
  const pair = validPair();

  for (const submission of [pair, pair, validPair({ name: "Alex Example", email: "other@example.com" })]) {
    assert.equal((await request(app).post("/api/submissions").send(submission)).status, 201);
  }

  assert.equal(repository.rows.length, 3);
  assert.deepEqual(repository.rows.map((row) => row.id), ["1", "2", "3"]);
});

test("rejects the 101st successful submission and leaves it unstored", async () => {
  const { app, repository } = makeApp();
  for (let index = 0; index < 100; index += 1) {
    assert.equal((await request(app).post("/api/submissions").send(validPair())).status, 201);
  }

  const response = await request(app).post("/api/submissions").send(validPair());

  assert.equal(response.status, 429);
  assert.deepEqual(response.body, { error: "capacity_unavailable" });
  assert.equal(repository.rows.length, 100);
});

test("reuses capacity when an earlier success reaches the rolling-window boundary", async () => {
  const { app, repository } = makeApp();
  for (let index = 0; index < 100; index += 1) {
    assert.equal((await request(app).post("/api/submissions").send(validPair())).status, 201);
  }
  repository.now = new Date(repository.now.getTime() + WINDOW_MS);

  const response = await request(app).post("/api/submissions").send(validPair());

  assert.equal(response.status, 201);
  assert.equal(repository.rows.length, 101);
});

test("concurrent submissions at capacity do not overshoot", async () => {
  const { app, repository } = makeApp();
  const responses = await Promise.all(
    Array.from({ length: 125 }, () => request(app).post("/api/submissions").send(validPair())),
  );

  assert.equal(responses.filter((response) => response.status === 201).length, 100);
  assert.equal(responses.filter((response) => response.status === 429).length, 25);
  assert.equal(repository.rows.length, 100);
});

test("invalid requests do not consume successful-submission capacity", async () => {
  const { app, repository } = makeApp();
  assert.equal(
    (await request(app).post("/api/submissions").send({ name: "", email: "invalid" })).status,
    400,
  );

  const response = await request(app).post("/api/submissions").send(validPair());

  assert.equal(response.status, 201);
  assert.equal(repository.rows.length, 1);
});

test("persistence failures return non-success and do not consume capacity", async () => {
  const { app, repository } = makeApp();
  repository.failNextWrite = true;

  const failed = await request(app).post("/api/submissions").send(validPair());
  const succeeded = await request(app).post("/api/submissions").send(validPair());

  assert.equal(failed.status, 500);
  assert.deepEqual(failed.body, { error: "submission_failed" });
  assert.equal(succeeded.status, 201);
  assert.equal(repository.rows.length, 1);
});
