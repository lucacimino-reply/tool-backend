import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { newDb } from "pg-mem";
import request from "supertest";

import { createApp } from "../../src/app.js";
import { createSubmissionRepository } from "../../src/features/contacts/contacts.repository.js";
import { validateSubmission } from "../../src/features/contacts/contacts.schema.js";
import type { SubmissionRepository } from "../../src/features/contacts/contacts.types.js";

async function createTestDatabase() {
  const database = newDb();
  const { Pool } = database.adapters.createPg();
  const pool = new Pool();
  const migrationPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../src/db/migrations/0001-create-submissions.sql",
  );
  await pool.query(await readFile(migrationPath, "utf8"));
  return pool;
}

test("validation maps invalid fields without persistence", () => {
  assert.deepEqual(validateSubmission({ name: "", email: "invalid" }), {
    errors: {
      name: "Name must be a string between 1 and 100 characters.",
      email: "Email must be a valid email address of at most 254 characters.",
    },
  });
});

test("POST /submissions persists valid payloads and accepts duplicates", async () => {
  const pool = await createTestDatabase();
  const app = createApp(createSubmissionRepository(pool));

  for (const input of [
    { name: "Ada", email: "ada@example.com" },
    { name: "Ada", email: "ada@example.com" },
    { name: "Ada", email: "another@example.com" },
    { name: "Grace", email: "ada@example.com" },
  ]) {
    const response = await request(app).post("/submissions").send(input);
    assert.equal(response.status, 201);
    assert.equal(response.text, "");
  }

  const rows = await pool.query("SELECT name, email FROM submissions ORDER BY id");
  assert.deepEqual(rows.rows, [
    { name: "Ada", email: "ada@example.com" },
    { name: "Ada", email: "ada@example.com" },
    { name: "Ada", email: "another@example.com" },
    { name: "Grace", email: "ada@example.com" },
  ]);
  await pool.end();
});

test("POST /submissions rejects invalid JSON inputs with field-only errors", async () => {
  const pool = await createTestDatabase();
  const app = createApp(createSubmissionRepository(pool));
  const cases = [
    {},
    { name: "Ada" },
    { email: "ada@example.com" },
    { name: 2, email: false },
    { name: "x".repeat(101), email: "ada@example.com" },
    { name: "Ada", email: "invalid" },
    { name: "Ada", email: `${"a".repeat(244)}@example.com` },
    { name: "Ada", email: "ada@example.com", extra: true },
  ];

  for (const input of cases) {
    const response = await request(app).post("/submissions").send(input);
    assert.equal(response.status, 400);
    assert.match(response.headers["content-type"] ?? "", /^application\/json/);
    assert.ok(response.body.errors);
    assert.deepEqual(Object.keys(response.body.errors).sort(), Object.keys(response.body.errors).filter((key) => key === "name" || key === "email").sort());
  }
  assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM submissions")).rows[0].count, 0);
  await pool.end();
});

test("POST /submissions rejects oversized JSON before persistence", async () => {
  const pool = await createTestDatabase();
  const app = createApp(createSubmissionRepository(pool));
  const response = await request(app)
    .post("/submissions")
    .set("Content-Type", "application/json")
    .send(JSON.stringify({ name: "Ada", email: "ada@example.com", ignored: "x".repeat(2_048) }));

  assert.equal(response.status, 400);
  assert.match(response.headers["content-type"] ?? "", /^application\/json/);
  assert.deepEqual(response.body, {
    errors: {
      name: "Request body is too large.",
      email: "Request body is too large.",
    },
  });
  assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM submissions")).rows[0].count, 0);
  await pool.end();
});

test("POST /submissions returns 500 when persistence fails", async () => {
  const repository: SubmissionRepository = { create: async () => Promise.reject(new Error("database down")) };
  const response = await request(createApp(repository))
    .post("/submissions")
    .send({ name: "Ada", email: "ada@example.com" });

  assert.equal(response.status, 500);
  assert.match(response.headers["content-type"] ?? "", /^application\/json/);
  assert.deepEqual(response.body, { message: "Unable to process submission." });
});
