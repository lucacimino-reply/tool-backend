# tool-backend

## Contact submissions

`POST /contact-submissions` accepts a JSON object containing only `name` and
`email`. Valid submissions are stored exactly as received. Duplicate names,
email addresses, and complete pairs are intentionally allowed.

JSON request bodies are limited to 16 KiB before schema validation and database
access. Oversized or malformed JSON responses use the contract's `422`
validation-error shape.

Name length and email length use Unicode code points (`Array.from`), while
email syntax uses the conventional `validator` library interpretation of the
OpenAPI `email` format. Inputs are not trimmed, normalized, or otherwise
rewritten before validation or storage.

## Configuration

Copy the variable names from `.env.example`. `PORT` defaults to `3000`.
`DATABASE_URL` is required and points to PostgreSQL. `MIGRATION_TIMEOUT_MS`
defaults to `60000`; container startup retries the database connection within
that bounded period before applying migrations. The same limit bounds waiting
for the PostgreSQL migration advisory lock.

## Commands

Run tests with `npm test`. Build the application with `npm run build`.

Build the runtime image without starting it:

```sh
docker build --tag tool-backend:contact-submission-api .
```

The production command first runs `node dist/db/migrate.js`, then replaces the
entrypoint with `node dist/server.js`.
