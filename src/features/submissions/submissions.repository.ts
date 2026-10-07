import type { Pool } from "pg";

import type { Submission, SubmissionInput, SubmissionStore } from "./submissions.types.js";

const CAPACITY_LOCK_ID = 4_286_320;
const CAPACITY = 100;
const WINDOW_MS = 60 * 60 * 1000;

type SubmissionRow = {
  id: string;
  name: string;
  email: string;
  created_at: Date;
};

export class PostgresSubmissionStore implements SubmissionStore {
  constructor(private readonly pool: Pool) {}

  async createWithinCapacity(input: SubmissionInput): Promise<Submission | null> {
    const client = await this.pool.connect();
    let transactionOpen = false;
    let releaseError: Error | undefined;

    try {
      await client.query("BEGIN");
      transactionOpen = true;
      await client.query("SELECT pg_advisory_xact_lock($1)", [CAPACITY_LOCK_ID]);

      const clock = await client.query<{ now: Date }>("SELECT clock_timestamp() AS now");
      const now = clock.rows[0]?.now;
      if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
        throw new Error("PostgreSQL returned an invalid clock value.");
      }
      const windowStart = new Date(now.getTime() - WINDOW_MS);

      const count = await client.query<{ count: string }>(
        "SELECT COUNT(*) AS count FROM submissions WHERE created_at > $1",
        [windowStart],
      );

      if (BigInt(count.rows[0]?.count ?? "0") >= BigInt(CAPACITY)) {
        await client.query("COMMIT");
        transactionOpen = false;
        return null;
      }

      const inserted = await client.query<SubmissionRow>(
        "INSERT INTO submissions (name, email, created_at) VALUES ($1, $2, $3) RETURNING id, name, email, created_at",
        [input.name, input.email, now],
      );
      const row = inserted.rows[0];
      if (row === undefined) {
        throw new Error("PostgreSQL did not return the persisted submission.");
      }

      await client.query("COMMIT");
      transactionOpen = false;
      return { id: row.id, name: row.name, email: row.email, createdAt: row.created_at };
    } catch (error) {
      if (transactionOpen) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          releaseError = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError));
        }
      }
      throw error;
    } finally {
      client.release(releaseError);
    }
  }
}
