import { newDb } from "pg-mem";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../src/app.js";
import { ContactSubmissionRepository } from "../../src/features/contact-submissions/contact-submissions.repository.js";

type TestDatabase = {
  close: () => Promise<void>;
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

const databases: TestDatabase[] = [];

function createTestDatabase(createTable = true): TestDatabase {
  const database = newDb();
  const Pool = database.adapters.createPg().Pool;
  const pool = new Pool();
  if (createTable) {
    database.public.none(`
      CREATE TABLE contact_submissions (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  const testDatabase: TestDatabase = {
    close: () => pool.end(),
    query: (text, values) => pool.query(text, values),
  };
  databases.push(testDatabase);
  return testDatabase;
}

function createTestApp(createTable = true) {
  const database = createTestDatabase(createTable);
  return { app: createApp(new ContactSubmissionRepository(database)), database };
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

describe("POST /contact-submissions", () => {
  it("persists an exact valid pair before returning 201", async () => {
    const { app, database } = createTestApp();

    await request(app).post("/contact-submissions").send({ name: "Ada Lovelace", email: "ada@example.com" }).expect(201);

    await expect(database.query("SELECT name, email FROM contact_submissions")).resolves.toMatchObject({
      rows: [{ email: "ada@example.com", name: "Ada Lovelace" }],
    });
  });

  it("persists repeated pairs and values without uniqueness checks", async () => {
    const { app, database } = createTestApp();

    await request(app).post("/contact-submissions").send({ name: "Ada", email: "ada@example.com" }).expect(201);
    await request(app).post("/contact-submissions").send({ name: "Ada", email: "ada@example.com" }).expect(201);
    await request(app).post("/contact-submissions").send({ name: "Ada", email: "other@example.com" }).expect(201);
    await request(app).post("/contact-submissions").send({ name: "Other", email: "ada@example.com" }).expect(201);

    await expect(database.query("SELECT id FROM contact_submissions")).resolves.toMatchObject({
      rows: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
    });
  });

  it("reports missing recognized fields without persisting", async () => {
    const { app, database } = createTestApp();

    await request(app).post("/contact-submissions").send({ email: "ada@example.com" }).expect(422).expect({
      errors: { name: "Name is required and must be a string." },
    });
    await request(app).post("/contact-submissions").send({ name: "Ada" }).expect(422).expect({
      errors: { email: "Email is required and must be a string." },
    });

    await expect(database.query("SELECT id FROM contact_submissions")).resolves.toMatchObject({ rows: [] });
  });

  it("enforces field bounds and accepts their valid boundaries", async () => {
    const { app, database } = createTestApp();
    const longestEmail = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(57)}.com`;

    expect(Array.from(longestEmail)).toHaveLength(254);
    await request(app).post("/contact-submissions").send({ name: "", email: "ada@example.com" }).expect(422).expect({
      errors: { name: "Name must contain between 1 and 100 characters." },
    });
    await request(app).post("/contact-submissions").send({ name: "a".repeat(101), email: "ada@example.com" }).expect(422);
    await request(app).post("/contact-submissions").send({ name: "Ada", email: "invalid" }).expect(422).expect({
      errors: { email: "Email must be a valid email address with at most 254 characters." },
    });
    await request(app).post("/contact-submissions").send({ name: "Ada", email: `${"a".repeat(255)}@example.com` }).expect(422);
    await request(app).post("/contact-submissions").send({ name: "a", email: "a@example.com" }).expect(201);
    await request(app).post("/contact-submissions").send({ name: "a".repeat(100), email: longestEmail }).expect(201);

    await expect(database.query("SELECT id FROM contact_submissions")).resolves.toMatchObject({ rows: [{ id: 1 }, { id: 2 }] });
  });

  it("returns ValidationError-shaped responses for malformed schemas and JSON", async () => {
    const { app, database } = createTestApp();

    await request(app).post("/contact-submissions").send({ name: "Ada", email: "ada@example.com", extra: true }).expect(422).expect({ errors: {} });
    await request(app).post("/contact-submissions").send({ name: 1, email: false }).expect(422).expect({
      errors: {
        name: "Name is required and must be a string.",
        email: "Email is required and must be a string.",
      },
    });
    await request(app).post("/contact-submissions").set("Content-Type", "application/json").send("{\"name\":").expect(422).expect({ errors: {} });

    await expect(database.query("SELECT id FROM contact_submissions")).resolves.toMatchObject({ rows: [] });
  });

  it("rejects oversized JSON before validation or persistence", async () => {
    const { app, database } = createTestApp();

    await request(app)
      .post("/contact-submissions")
      .send({ email: "ada@example.com", extra: "x".repeat(16 * 1024), name: "Ada" })
      .expect(422)
      .expect({ errors: {} });

    await expect(database.query("SELECT id FROM contact_submissions")).resolves.toMatchObject({ rows: [] });
  });

  it("returns SubmissionError when the database write fails", async () => {
    const { app } = createTestApp(false);

    await request(app).post("/contact-submissions").send({ name: "Ada", email: "ada@example.com" }).expect(500).expect({
      message: "Unable to process submission.",
    });
  });
});
