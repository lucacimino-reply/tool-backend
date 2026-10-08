# tool-backend

Node.js 22.22.1, Express, TypeScript, and PostgreSQL provide the contact-submission API. PostgreSQL is the durable source of truth. Submission admission uses a transaction-scoped advisory lock shared across service instances, so concurrent requests cannot exceed the rolling service-wide limit.

## Configuration and startup

Copy `.env.example` to `.env` and replace the database connection placeholder with the local PostgreSQL connection string before starting the application. Keep `.env` private; it is ignored by Git and excluded from the image. The image can also receive the same values through its runtime environment.

Configuration:

- `PORT`: HTTP listen port, default `3000`.
- `DATABASE_URL`: PostgreSQL connection string.
- `MIGRATION_TIMEOUT_MS`: per-statement startup-migration timeout in milliseconds, default `30000`.
- `NODE_ENV`: `development`, `test`, or `production`.

Install dependencies and start the compiled server with `npm ci`, `npm run build`, then `npm start`. Startup validates configuration, applies registered forward-only migrations, and only then accepts HTTP traffic.

## Submission interface

`POST /api/submissions` accepts JSON with required string fields `name` and `email`:

```json
{"name":"Alex Example","email":"alex@example.com"}
```

The request body is limited to 16 KiB. Larger bodies are rejected with `413 Payload Too Large` and
`{"error":"request_too_large"}` before submission validation or persistence.

The backend preserves both values exactly as supplied. Name length is 1-100 characters; email must be valid and no longer than 254 characters. Repeated values and identical pairs create separate records.

Outcomes:

- `201 Created`: `{"submission":{"name":"Alex Example","email":"alex@example.com"}}`; returned only after the database commit succeeds.
- `400 Bad Request`: `{"error":"validation_failed","fields":{"email":"Enter a valid email address."}}`; invalid fields are not stored.
- `429 Too Many Requests`: `{"error":"capacity_unavailable"}`; a valid request is not stored when 100 successful submissions fall within the current rolling 60-minute interval.
- `500 Internal Server Error`: `{"error":"submission_failed"}` for persistence and unexpected submission failures; success is never reported for a failed write.

Both capacity and server failures are non-success outcomes and may use the frontend's generic failure behavior. No retrieval endpoint is provided.

## Submission retention

Each accepted submission is stored as a distinct record with its own expiry deadline, exactly 365 elapsed days (365 x 24 hours) after acceptance. The service deletes records at or after their individual deadline. Existing records receive deadlines based on their persisted `submitted_at` timestamp when the expiry migration runs. Cleanup runs once during startup before the API accepts traffic, then every 60 seconds during normal operation; overdue records are therefore caught up after a restart without a visitor request. No additional lifecycle configuration is required. Expiry does not change an already displayed confirmation and has no visitor-facing retrieval or notification flow.

## Tests and image build

Run `npm test` for repository-native HTTP and service tests. They use isolated in-memory test storage and controllable time; no database or external integration is required.

Build the independently buildable runtime image without starting a container:

```sh
docker build --tag tool-backend:delete-accepted-submissions-after-365-days .
```

The Dockerfile pins Node to `22.22.1-alpine3.23`, installs the committed lockfile with `npm ci`, compiles TypeScript in a build stage, and runs the compiled server as the non-root `node` user. The container listens on port `3000`; inject `DATABASE_URL`, and optionally `PORT`, `MIGRATION_TIMEOUT_MS`, and `NODE_ENV`, when running it.
