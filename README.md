# Details contact submissions backend

Node.js 22.21.0, Express 5, TypeScript, and PostgreSQL (`pg`) backend for accepting visitor contact submissions. The application applies database migrations at startup before listening for HTTP traffic. It does not provide authentication, visitor retrieval, email delivery, analytics, or external integrations.

## Local configuration and startup

Install Node.js 22.21.0 or newer and make a PostgreSQL database available. Copy `.env.example` to `.env`, then replace the `DATABASE_URL` placeholder with the connection URL for that database. Do not commit `.env` or put secrets in `.env.example`.

```sh
npm ci
npm test
npm run build
npm start
```

The server loads `.env` through Node's `--env-file-if-exists` option and reads configuration only at startup. `NODE_ENV` defaults to `development`; `DATABASE_URL` must be a PostgreSQL URL. `PORT` defaults to `3000`; `CONNECTION_TIMEOUT_MS` defaults to `5000`; `MIGRATION_TIMEOUT_MS` defaults to `60000` and bounds startup connection/migration work; `SHUTDOWN_TIMEOUT_MS` defaults to `10000`. Their accepted ranges and local placeholders are documented in `.env.example`. Startup exits without accepting traffic if configuration, database connectivity, or migrations fail.

## Submission interface

`POST /api/submissions` accepts JSON with required string properties `name` and `email`:

```http
POST /api/submissions HTTP/1.1
Content-Type: application/json

{"name":"Alex Example","email":"alex@example.com"}
```

Name must contain 1-100 Unicode characters. Email must have a valid email format and contain no more than 254 characters. The backend validates before persistence and preserves submitted values without trimming or normalization. Duplicate names, email addresses, and identical pairs are stored as distinct submissions.

On persistence success, the API returns `201 Created` with the accepted values:

```json
{
  "submission": {
    "id": "1",
    "name": "Alex Example",
    "email": "alex@example.com",
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
}
```

Invalid input returns `400` with `error.code` equal to `VALIDATION_FAILED` and a `fields` object keyed by invalid field. Malformed JSON returns `400` with `error.code` equal to `INVALID_JSON`; JSON bodies larger than 16 KiB return `413` with `error.code` equal to `REQUEST_TOO_LARGE`. Both parser failures occur before submission validation or storage. Requests without the `application/json` media type return `415` with `error.code` equal to `UNSUPPORTED_MEDIA_TYPE`. An otherwise-valid request rejected at the service-wide capacity returns `429` with `error.code` equal to `CAPACITY_EXCEEDED`. Backend or storage failure returns `500` with `error.code` equal to `SUBMISSION_FAILED`. Both capacity and backend/storage responses are non-success outcomes; the client can map them to the product's generic message, “Unable to submit your information. Please try again.” Success is sent only after the insert commits.

The service accepts at most 100 persisted submissions in a rolling 60-minute window across all instances using the same PostgreSQL database. A transaction-scoped PostgreSQL advisory lock serializes capacity checks and inserts. Requests at capacity are not stored. The separate 365-day retention/deletion lifecycle is not part of this service version.

## Runtime image

Install the lockfile-pinned dependencies with `npm ci`, then build the independently buildable runtime image from this repository without starting a container. The Docker build itself runs offline and uses only this repository's installed dependencies:

```sh
npm ci
docker build --network=none --tag tool-backend:local .
```

Both image stages use `node:22.21.0-bookworm-slim`; the build stage compiles with the installed lockfile-pinned dependencies and prunes development dependencies before the final stage is assembled. The final stage includes only production dependencies and compiled JavaScript and runs as the non-root `node` user. The production command is `node --env-file-if-exists=.env dist/server.js`; the container starts Node directly so container signals are delivered to the server. Inject `DATABASE_URL`, `PORT`, and timeout configuration through the runtime environment; `.env` is excluded from the image. Migrations run against the configured PostgreSQL database before the server accepts traffic.
