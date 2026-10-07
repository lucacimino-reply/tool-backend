export const createSubmissionsMigration = `
CREATE TABLE submissions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(100) NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  email VARCHAR(254) NOT NULL CHECK (char_length(email) BETWEEN 1 AND 254),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX submissions_created_at_idx ON submissions (created_at);
`;
