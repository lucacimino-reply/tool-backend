import type { Pool } from "pg";

import type { NewSubmission, StoredSubmission, SubmissionRepository } from "./contacts.types.js";

const SUBMISSION_LOCK_ID = "731459827106";
const SUBMISSION_LIMIT = 100;
const RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

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

        const submittedAt = clock.rows[0]!.now;
        const expiresAt = new Date(submittedAt.getTime() + RETENTION_MS);
        const inserted = await client.query<{
          id: string;
          name: string;
          email: string;
          submitted_at: Date;
          expires_at: Date;
        }>(
          "INSERT INTO contact_submissions (name, email, submitted_at, expires_at) VALUES ($1, $2, $3, $4) RETURNING id, name, email, submitted_at, expires_at",
          [submission.name, submission.email, submittedAt, expiresAt],
        );
        await client.query("COMMIT");
        transactionStarted = false;
        const row = inserted.rows[0]!;
        return {
          id: row.id,
          name: row.name,
          email: row.email,
          submittedAt: row.submitted_at,
          expiresAt: row.expires_at,
        };
      } catch (error) {
        if (transactionStarted) await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async deleteExpired(): Promise<number> {
      const result = await pool.query("DELETE FROM contact_submissions WHERE expires_at <= clock_timestamp()");
      return result.rowCount ?? 0;
    },
  };
}
