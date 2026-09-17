export const seedSql = `
INSERT INTO promotions (id, code, code_identity, amount_cents, active)
VALUES (1, 'CLEAN10', 'CLEAN10', 1000, TRUE)
ON CONFLICT (id) DO NOTHING;
`;

export const sql = `
CREATE TABLE promotions (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  code VARCHAR(64) NOT NULL UNIQUE CHECK (code = 'CLEAN10'),
  code_identity VARCHAR(64) NOT NULL UNIQUE CHECK (code_identity = 'CLEAN10'),
  amount_cents INTEGER NOT NULL CHECK (amount_cents = 1000),
  active BOOLEAN NOT NULL CHECK (active),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

${seedSql}
`;
