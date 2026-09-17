import type { Pool, PoolClient } from 'pg';

import type { Customer } from './auth.types.js';

type StoredCustomer = Customer & { passwordHash: string };

const customerColumns = 'id, name, email';

export async function findCustomerByIdentity(pool: Pool, emailIdentity: string): Promise<StoredCustomer | undefined> {
  const result = await pool.query<StoredCustomer>(
    `SELECT ${customerColumns}, password_hash AS "passwordHash" FROM customers WHERE email_identity = $1`,
    [emailIdentity],
  );
  return result.rows[0];
}

export async function createCustomer(client: PoolClient, customer: Customer, emailIdentity: string, passwordHash: string): Promise<void> {
  await client.query(
    'INSERT INTO customers (id, name, email, email_identity, password_hash) VALUES ($1, $2, $3, $4, $5)',
    [customer.id, customer.name, customer.email, emailIdentity, passwordHash],
  );
}

export async function createSession(client: PoolClient, id: string, customerId: string, tokenHash: string, expiresAt: Date): Promise<void> {
  await client.query(
    'INSERT INTO browser_sessions (id, customer_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
    [id, customerId, tokenHash, expiresAt],
  );
}

export async function findSessionCustomer(pool: Pool, tokenHash: string): Promise<Customer | undefined> {
  const result = await pool.query<Customer>(
    `SELECT c.${customerColumns} FROM browser_sessions s JOIN customers c ON c.id = s.customer_id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
    [tokenHash],
  );
  return result.rows[0];
}
