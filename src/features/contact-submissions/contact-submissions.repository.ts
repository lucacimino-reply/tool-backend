import type { Pool } from "pg";

import type { ContactSubmission } from "./contact-submissions.types.js";

export class ContactSubmissionRepository {
  public constructor(private readonly pool: Pick<Pool, "query">) {}

  public async create(submission: ContactSubmission): Promise<void> {
    await this.pool.query(
      "INSERT INTO contact_submissions (name, email) VALUES ($1, $2)",
      [submission.name, submission.email],
    );
  }
}
