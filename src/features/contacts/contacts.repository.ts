import type { Pool } from "pg";

import type { ContactSubmissionInput, SubmissionRepository } from "./contacts.types.js";

export function createSubmissionRepository(pool: Pool): SubmissionRepository {
  return {
    async create(input: ContactSubmissionInput): Promise<void> {
      await pool.query("INSERT INTO submissions (name, email) VALUES ($1, $2)", [input.name, input.email]);
    },
  };
}
