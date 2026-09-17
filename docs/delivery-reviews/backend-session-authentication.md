# Delivery review: backend-session-authentication

## Candidate

- Delivery unit: `backend-session-authentication` (Session authentication API)
- Delivery type: backend
- Base commit: `e4e6a264ab8f93f537693f2aa276adef36921b28`
- Candidate head reviewed: `8839f961d0039f5944d2fdb80f4917e0fb3bf684`
- Task: `implement-persistent-session-authentication`
- Agent Content release: `agent-content-v14` (`58f6df9e56ae1ddf4c27c2b098ebe5a8985e4d2b`)

## Authoritative Evidence

- PRD: `context/prd.md`, REQ-002 and REQ-003.
- Task specification: `context/tasks/implement-persistent-session-authentication.md`.
- HTTP contract: `context/openapi-spec.json`, operations `signUp`, `logIn`, and `getSession`.
- Design description: `context/design-description.md`; this backend delivery has no assigned `designReferences`, so no render introduces a backend-visible requirement.
- Supporting planning evidence: `context/analysis/tool-backend-b5ed4fdf.md` and `context/analysis/tool-frontend-711fa136.md`.

## Scope Review

The candidate adds Node 22, Express, TypeScript, PostgreSQL persistence, immutable startup migrations, scrypt password hashing, opaque hashed browser-session tokens, and repository-local container packaging. The public `/api/auth/signup`, `/api/auth/login`, and `/api/auth/session` routes implement the assigned contract only.

Signup and login trim names and emails before validation, preserve passwords exactly, compare a lowercased trimmed email identity under a database uniqueness constraint, return the required public customer projection, and set a session-only `clean_session` cookie. Signup validation and duplicate handling match the `422` and `409` contracts; login validation and unknown/wrong credential handling match the required `422` and exact `401` problem. Session lookup rejects absent, invalid, expired, and revoked tokens with the contracted unauthenticated problem. Credentials and session tokens are not exposed in HTTP responses, and persistence stores only password and token hashes.

The JSON parser has a 16kb limit before route validation or password hashing runs. Cookie/header parsing remains bounded by the Node HTTP server's finite header limit. The review added direct coverage that an over-limit signup request receives a deliberate contracted `422` response and cannot create a customer.

## Defects Corrected

- Oversized JSON parser errors previously reached the generic error handler and returned `500`. They now return the contract-compatible `422 ValidationProblem` with a `body` field error, before customer creation or password hashing.
- `DATABASE_URL` previously accepted any syntactically valid URL. Configuration now requires `postgres://` or `postgresql://` and reports only variable names and validation reasons, never supplied configuration values.

## Verification

- `npm test`: passed, 2 files and 9 tests. Exercises HTTP signup, login, session continuity, normalization, validation, duplicate identity, password preservation, expired/revoked sessions, oversize-body rejection, and configuration protocol validation using isolated `pg-mem` storage.
- `npm run build`: passed. Strict TypeScript compilation completed.
- `docker build -t tool-backend:latest .`: passed without starting a container. The built image uses the repository alone; it does not start or contact the frontend, application services, or a database.
- `build-manifest.json`: confirmed as `{ "image": { "name": "tool-backend", "tag": "latest" } }`, matching the successful final image build.

## Result

The reviewed and corrected delivery satisfies its completion statement, REQ-002, REQ-003, the three assigned OpenAPI operations, and all Task implementation constraints.
