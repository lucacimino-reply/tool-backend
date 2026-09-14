# STUDIO contact backend

`POST /submissions` retains validated contact submissions in PostgreSQL.

## Development

Copy `.env.example` to `.env`, set `DATABASE_URL`, then run:

```sh
npm install
npm run dev
```

The server listens on `PORT` (default `3000`). It retries the PostgreSQL
connection and migrations for `MIGRATION_TIMEOUT_MS` (default `60000`).

## Verification

```sh
npm test
npm run build
docker build --tag studio-contact-backend:local .
```

The production command is `node dist/server.js`. The container runs migrations
before starting that command.
