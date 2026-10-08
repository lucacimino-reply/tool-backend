export const createSubmissionsSql = `
CREATE TABLE contact_submissions (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  email VARCHAR(254) NOT NULL CHECK (char_length(email) BETWEEN 1 AND 254),
  submitted_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX contact_submissions_submitted_at_idx
  ON contact_submissions (submitted_at);
`;
