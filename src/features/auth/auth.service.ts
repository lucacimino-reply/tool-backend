import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import type { Pool } from 'pg';

import { createCustomer, createSession, findCustomerByIdentity, findSessionCustomer } from './auth.repository.js';
import type { AuthenticatedCustomer, Customer, LoginInput, SignUpInput } from './auth.types.js';

const scrypt = promisify(scryptCallback);
const SCRYPT_KEY_LENGTH = 64;

export class DuplicateEmailError extends Error {}

export function emailIdentity(email: string): string {
  return email.toLowerCase();
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, SCRYPT_KEY_LENGTH) as Buffer;
  return `scrypt$${salt}$${hash.toString('hex')}`;
}

async function passwordsMatch(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, salt, hash] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !salt || !hash) return false;
  const derived = await scrypt(password, salt, SCRYPT_KEY_LENGTH) as Buffer;
  const expected = Buffer.from(hash, 'hex');
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

function newSession(): { id: string; token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { id: randomUUID(), token, tokenHash: createHash('sha256').update(token).digest('hex') };
}

async function establishSession(pool: Pool, customer: Customer, durationHours: number): Promise<string> {
  const session = newSession();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await createSession(client, session.id, customer.id, session.tokenHash, new Date(Date.now() + durationHours * 3_600_000));
    await client.query('COMMIT');
    return session.token;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function signUp(pool: Pool, input: SignUpInput, durationHours: number): Promise<{ authenticated: AuthenticatedCustomer; token: string }> {
  const customer: Customer = { id: randomUUID(), name: input.name, email: input.email };
  const session = newSession();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await createCustomer(client, customer, emailIdentity(input.email), await hashPassword(input.password));
    await createSession(client, session.id, customer.id, session.tokenHash, new Date(Date.now() + durationHours * 3_600_000));
    await client.query('COMMIT');
    return { authenticated: { customer }, token: session.token };
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') throw new DuplicateEmailError();
    throw error;
  } finally {
    client.release();
  }
}

export async function logIn(pool: Pool, input: LoginInput, durationHours: number): Promise<{ authenticated: AuthenticatedCustomer; token: string } | undefined> {
  const customer = await findCustomerByIdentity(pool, emailIdentity(input.email));
  if (!customer || !(await passwordsMatch(input.password, customer.passwordHash))) return undefined;
  return { authenticated: { customer: { id: customer.id, name: customer.name, email: customer.email } }, token: await establishSession(pool, customer, durationHours) };
}

export async function getSession(pool: Pool, token: string | undefined): Promise<AuthenticatedCustomer | undefined> {
  if (!token) return undefined;
  const customer = await findSessionCustomer(pool, createHash('sha256').update(token).digest('hex'));
  return customer ? { customer } : undefined;
}
