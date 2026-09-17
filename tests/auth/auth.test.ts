import { randomUUID } from 'node:crypto';

import { newDb } from 'pg-mem';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { sql as authMigration } from '../../src/db/migrations/001-create-auth.js';

let pool: ReturnType<ReturnType<typeof newDb>['adapters']['createPg']>['Pool']['prototype'];
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  const database = newDb();
  const adapter = database.adapters.createPg();
  pool = new adapter.Pool();
  await pool.query(authMigration);
  app = createApp(pool, { sessionDurationHours: 24, secureCookies: false });
});

afterEach(async () => pool.end());

describe('authentication API', () => {
  it('creates normalized customers and resolves a cookie session', async () => {
    const agent = request.agent(app);
    const signup = await agent.post('/api/auth/signup').send({ name: '  Ada Lovelace  ', email: '  Ada@Example.com ', password: ' pass word ', termsAccepted: true }).expect(201);
    expect(signup.body.customer).toMatchObject({ name: 'Ada Lovelace', email: 'Ada@Example.com' });
    expect(signup.headers['set-cookie'][0]).toContain('clean_session=');
    expect(signup.headers['set-cookie'][0]).not.toMatch(/Max-Age|Expires/);
    await agent.get('/api/auth/session').expect(200).expect(({ body }) => expect(body).toEqual(signup.body));
    const stored = await pool.query('SELECT password_hash FROM customers');
    expect(stored.rows[0].password_hash).not.toContain(' pass word ');
  });

  it('accepts boundary-valid normalized credential values', async () => {
    const response = await request(app).post('/api/auth/signup').send({
      name: ` ${'n'.repeat(100)} `,
      email: ` ${'a'.repeat(242)}@example.com `,
      password: 'p'.repeat(64),
      termsAccepted: true,
    }).expect(201);
    expect(response.body.customer.name).toHaveLength(100);
    expect(response.body.customer.email).toHaveLength(254);
  });

  it('rejects invalid signup fields and duplicate normalized identities without a session', async () => {
    const invalid = await request(app).post('/api/auth/signup').send({ name: ' ', email: 'not-an-email', password: 'short', termsAccepted: false }).expect(422);
    expect(invalid.body.fieldErrors).toMatchObject({ name: expect.any(String), email: expect.any(String), password: expect.any(String), termsAccepted: expect.any(String) });
    await request(app).get('/api/auth/session').expect(401).expect({ code: 'unauthenticated', message: 'Authentication is required.' });
    await request(app).post('/api/auth/signup').send({ name: 'Ada', email: 'Ada@example.com', password: 'password1', termsAccepted: true }).expect(201);
    const duplicate = await request(app).post('/api/auth/signup').send({ name: 'Grace', email: ' ada@EXAMPLE.com ', password: 'password2', termsAccepted: true }).expect(409);
    expect(duplicate.body).toMatchObject({ code: 'duplicate_email', fieldErrors: { email: expect.any(String) } });
  });

  it('logs in using normalized email but preserves password input exactly', async () => {
    await request(app).post('/api/auth/signup').send({ name: 'Ada', email: 'ada@example.com', password: ' leading ', termsAccepted: true }).expect(201);
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: ' ADA@EXAMPLE.COM ', password: ' leading ' }).expect(200);
    await agent.get('/api/auth/session').expect(200);
    const wrongPassword = await request(app).post('/api/auth/login').send({ email: 'ada@example.com', password: ' leadingX' }).expect(401);
    expect(wrongPassword.body).toEqual({ code: 'incorrect_credentials', message: 'The email or password you entered is incorrect.' });
    await request(app).get('/api/auth/session').expect(401);
  });

  it('validates login fields and rejects unusable session tokens', async () => {
    const validation = await request(app).post('/api/auth/login').send({ email: ' ', password: 'short' }).expect(422);
    expect(validation.body.fieldErrors).toMatchObject({ email: expect.any(String), password: expect.any(String) });
    await request(app).get('/api/auth/session').set('Cookie', 'clean_session=invalid').expect(401);
  });

  it('rejects oversized JSON before creating a customer', async () => {
    const response = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Ada', email: 'ada@example.com', password: 'password1', termsAccepted: true, padding: 'x'.repeat(16 * 1024) })
      .expect(422);

    expect(response.body).toEqual({
      code: 'validation_error',
      message: 'One or more fields are invalid.',
      fieldErrors: { body: 'Request body must be at most 16kb.' },
    });
    await expect(pool.query('SELECT * FROM customers')).resolves.toMatchObject({ rows: [] });
  });

  it('does not resolve expired or revoked sessions', async () => {
    const agent = request.agent(app);
    const signup = await agent.post('/api/auth/signup').send({ name: 'Ada', email: `ada-${randomUUID()}@example.com`, password: 'password1', termsAccepted: true }).expect(201);
    const cookie = signup.headers['set-cookie'][0].split(';')[0];
    await pool.query('UPDATE browser_sessions SET expires_at = now() - interval \'1 hour\'');
    await request(app).get('/api/auth/session').set('Cookie', cookie).expect(401);
    await pool.query('UPDATE browser_sessions SET expires_at = now() + interval \'1 hour\', revoked_at = now()');
    await request(app).get('/api/auth/session').set('Cookie', cookie).expect(401);
  });
});
