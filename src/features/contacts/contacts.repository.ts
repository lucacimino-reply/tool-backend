import type { Pool } from "pg";

import type { NewSubmission, StoredSubmission, SubmissionRepository } from "./contacts.types.js";

const SUBMISSION_LOCK_ID = "731459827106";
const SUBMISSION_LIMIT = 100;

export function createSubmissionRepository(pool: Pool): SubmissionRepository {
  return {
    async createWithinCapacity(submission: NewSubmission): Promise<StoredSubmission | null> {
      const client = await pool.connect();
      let transactionStarted = false;

      try {
        await client.query("BEGIN");
        transactionStarted = true;
        await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [SUBMISSION_LOCK_ID]);

        const clock = await client.query<{ now: Date }>("SELECT clock_timestamp() AS now");
        const count = await client.query<{ count: string }>(
          "SELECT count(*) AS count FROM contact_submissions WHERE submitted_at > $1::timestamptz - INTERVAL '60 minutes'",
          [clock.rows[0]!.now],
        );
        if (Number(count.rows[0]!.count) >= SUBMISSION_LIMIT) {
          await client.query("ROLLBACK");
          transactionStarted = false;
          return null;
        }

        const inserted = await client.query<{ id: string; name: string; email: string; submitted_at: Date }>(
          "INSERT INTO contact_submissions (name, email, submitted_at) VALUES ($1, $2, $3) RETURNING id, name, email, submitted_at",
          [submission.name, submission.email, clock.rows[0]!.now],
        );
        await client.query("COMMIT");
        transactionStarted = false;
        const row = inserted.rows[0]!;
        return { id: row.id, name: row.name, email: row.email, submittedAt: row.submitted_at };
      } catch (error) {
        if (transactionStarted) await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
