export const addSubmissionExpirySql = `
ALTER TABLE contact_submissions
  ADD COLUMN expires_at TIMESTAMPTZ;

UPDATE contact_submissions
  SET expires_at = submitted_at + INTERVAL '8760 hours';

ALTER TABLE contact_submissions
  ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX contact_submissions_expires_at_idx
  ON contact_submissions (expires_at);
`;
