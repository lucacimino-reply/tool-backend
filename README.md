# Clean backend

Node 22, Express, TypeScript, and PostgreSQL backend for Clean browser-session authentication.

## Local runtime

Copy `.env.example` to `.env`, then replace `DATABASE_URL` with a local PostgreSQL connection string. The server runs its immutable migrations before accepting traffic.

```text
npm install
npm run build
npm start
```

`PORT` defaults to `3000`. `DATABASE_URL` must be a `postgres://` or `postgresql://` connection string. `SESSION_DURATION_HOURS` controls server-side session validity; the `clean_session` cookie itself has no persistence attributes and therefore ends with the browser session. `MIGRATION_LOCK_TIMEOUT_MS` defaults to `30000` and bounds the wait for the startup migration lock.

## Tests

```text
npm test
```

Tests use an isolated in-memory PostgreSQL-compatible database and exercise the HTTP boundary without external services.

## Container

Build the independently runnable backend image without starting it:

```text
docker build -t tool-backend:latest .
```

At runtime provide `DATABASE_URL`, optionally `PORT` (default `3000`), `SESSION_DURATION_HOURS` (default `24`), and `MIGRATION_LOCK_TIMEOUT_MS` (default `30000`). The production command is `node --env-file-if-exists=.env dist/server.js`; migrations run before Express begins listening.
