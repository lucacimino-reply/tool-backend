# Delivery Review: backend-submission-and-capacity

## Reviewed scope and evidence

This review covers the backend Candidate for the `backend-submission-and-capacity` Delivery unit and its Task `implement-contact-submission-capacity`. The supplied Task requires REQ-001, REQ-004, REQ-005, REQ-006, REQ-007, and REQ-008. Review criteria were the authoritative `context/prd.md` and `context/tasks/implement-contact-submission-capacity.md`, with supporting evidence from all three Requirements Review analyses, the design description, and the backend repository analysis. The Task specifies no design references and no OpenAPI operations; no separate API specification is supplied. The implementation-defined interface is therefore reviewed as the contract for the frontend consumer, without assuming operation IDs.

The design description and source manifest were read. The Task's `design_references` list is empty, so no design render is an implementation prerequisite for this backend review. The PRD's visual and navigation obligations belong to the visitor-facing application and are not claimed as verified by this backend Candidate. The Task explicitly assigns 365-day retention/deletion to a separate Delivery unit; this review does not claim that lifecycle is implemented here.

## Candidate identity

| Repository | Base commit | Supplied Task Candidate head | Review correction commit |
| --- | --- | --- | --- |
| `https://github.com/lucacimino-reply/tool-backend.git` | `e4e6a264ab8f93f537693f2aa276adef36921b28` | `3924b291405cedbdc509be0bbca0d1cb33e98f18` | `495bbc67e011ce588b40d32945c97573bef2cebf` |

The corrected implementation was verified at the review correction commit. The review document is committed separately on top of that implementation. The supplied Candidate diff was inspected from base through head; the worktree was also inspected before correction.

## Findings and corrections

The Candidate implemented the documented submission route, field validation, distinct persistence of duplicate pairs, transaction-locked service-wide rolling capacity admission, error mapping, startup migrations/configuration, and standalone runtime image. No functional defect was found in these behaviors during source review and focused verification.

One trust-boundary verification gap was corrected: the app already bounded JSON request bodies at 16 KiB and rejected larger bodies with `413 request_too_large`, but the limit was absent from the client-consumed README contract and had no focused test proving rejection before persistence. The README now documents the limit and outcome. A focused HTTP test now proves that overlength name/email values and an oversized request are rejected before `SubmissionRepository.createWithinCapacity` runs.

## Requirement and interface assessment

- **REQ-001:** The backend exposes only its own submission behavior for this feature. No authentication, authorization, external API, email, analytics, third-party integration, retrieval route, or extra page behavior was added.
- **REQ-004:** Server validation requires string `name` and `email`, applies inclusive name length 1–100, validates email format and maximum length 254, and rejects invalid pairs before repository access. Tests cover invalid and accepted boundary values. The client-consumed response distinguishes validation failures by field.
- **REQ-005:** The repository inserts each accepted pair as a new row with no uniqueness check. It passes submitted strings unchanged. The route returns those values only after repository persistence succeeds; duplicate and preservation tests pass.
- **REQ-006:** Admission uses a PostgreSQL transaction-scoped advisory lock shared across service instances, counts successful rows in the preceding rolling 60 minutes, and inserts before releasing the lock. Capacity rejection does not insert. Duplicates count as separate rows. Tests cover the 100/101 boundary, rolling-window expiry, and concurrent requests.
- **REQ-007:** Persistence and unexpected submission failures map to non-success `500 submission_failed`; capacity rejection maps to non-success `429 capacity_unavailable`. Neither path returns a successful submission payload. The client can map both to the PRD's generic visitor-facing failure state.
- **REQ-008:** The endpoint returns `201` with the submitted name/email only after the repository's transaction commits. Failed writes do not return success.
- **Client-consumed interface:** `POST /api/submissions` accepts JSON `{ "name": string, "email": string }`. It returns `201` with `{ "submission": { "name", "email" } }`, `400 validation_failed` with field errors, `429 capacity_unavailable`, and `500 submission_failed`. Malformed JSON returns `400 invalid_json`; bodies over 16 KiB return `413 request_too_large`. These outcomes are documented in the backend README. There are no supplied operation IDs or independent API contract to reconcile against.
- **Trust boundary:** JSON parsing has a finite 16 KiB body limit before the route/controller runs. Name/email limits are checked before protected repository behavior. Rejections are deliberate and consistent, and focused tests assert that the repository is not called for either class of limit violation. The 100-per-hour product cap limits successful persistence only; it is not represented as a general request-rate or ingress-load limit.
- **Task packaging:** The runtime image is independently built from this repository with pinned `node:22.22.1-alpine3.23`, compiled production JavaScript and migrations, production dependencies, and a direct Node entrypoint running as the non-root `node` user. `.env.example`, startup config, local build documentation, and `build-manifest.json` are present and consistent.

## Verification

All verification ran locally against the backend repository; no application container was started and no database or other application repository was used.

| Command or check | Result |
| --- | --- |
| `npm test` | Passed: 13 server-side HTTP/repository tests, including validation, valid boundaries, duplicates, storage failure, capacity, concurrency, rolling-window reuse, and ingress limits. |
| `npm run build` | Passed: production TypeScript compilation. |
| `docker build --tag tool-backend:implement-contact-submission-capacity .` | Passed using only the backend repository build context; no container was started. |
| `docker image inspect tool-backend:implement-contact-submission-capacity` | Confirmed configured user `node`, direct command `node --env-file-if-exists=.env dist/server.js`, and built image ID `sha256:ba3796976d8b3c0f067e3c0bd7eb0fc69385ef8f76a1c6426cd5a0d1896c9b77`. |
| `git diff --check` | Passed. |

The test suite uses isolated in-memory repositories and a fake PostgreSQL client with controllable time; it does not connect to a live PostgreSQL server. The HTTP/service outcomes and repository transaction/query sequence were exercised through those fakes, while actual database execution remains unverified by this local review.

The root `build-manifest.json` names `tool-backend:implement-contact-submission-capacity`, matching the successfully built image.

## Agent Content provenance

This review corresponds to Agent Content release tag `agent-content-v9` at commit `15ca72856150b1736bea088f99f0ffb39dc4ff71`.

## Review conclusion

The backend Candidate satisfies its observable completion statement, required Task constraints and requirement IDs, and its documented consumer interface. The ingress-boundary documentation/test gap was corrected and committed. The final reviewed backend implementation is commit `495bbc67e011ce588b40d32945c97573bef2cebf`.
