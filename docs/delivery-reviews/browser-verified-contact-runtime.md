# Delivery Review: browser-verified-contact-runtime

## Candidate

- Delivery unit: `browser-verified-contact-runtime` - Compose and browser-verify the contact application.
- Test Task: `compose-and-browser-verify-contact-runtime`.
- Backend repository: `https://github.com/lucacimino-reply/tool-backend.git`.
- Frontend repository: `https://github.com/lucacimino-reply/tool-frontend.git`.
- Backend base commit: `d64c1987843ef1689bd59241be361392f7e90d90`.
- Backend Candidate commit: `6d60d8a428b861494693c8f0532206404c61671a`.
- Frontend base commit: `8a85ed65e50b75ee4c0c4dd5fb0035b5305c3b96`.
- Frontend Candidate commit: `b37424bc1f4aeada001f230e4bb87d898981b31d`.
- Agent Content release: `agent-content-v12` (`a820a0e5d53449c84212d0dcfcab52b3aa40fb0d`).

## Authoritative Evidence And Scope

- `context/prd.md`: REQ-001 through REQ-008.
- `context/design-description.md` and indexed renders `render-form-page-3-5` and `render-confirmation-page-3-32`: the two views, shared STUDIO header, form and confirmation content, controls, feedback transitions, and presentational navigation.
- `context/openapi-spec.json`: OpenAPI 3.1.2 `createSubmission`, JSON `POST /submissions`, 201 success, and 400/500 failure outcomes.
- `context/tasks/compose-and-browser-verify-contact-runtime.md`: backend-root composition, image-manifest handoff, Firefox lifecycle coverage, controlled backend failure, duplicate persistence inspection, and mandatory cleanup.
- The indexed repository analyses were used as supporting evidence only. Both candidate diffs and their current working trees were inspected directly.

This is a Test Candidate review. The committed Test Task outcome is the authority for its browser verification and cleanup. This review executed no verification commands and did not modify application, composition, manifest, or test files.

## Committed Test Task Diff

### Backend repository

- Added root `compose.yaml` with only `frontend`, `backend`, and `database`. It references `tool-frontend:frontend-contact-submission-flow-review` and `studio-contact-backend:local`, matching the non-empty `image.name` and `image.tag` values in the current frontend and backend root `build-manifest.json` files. It publishes only the frontend loopback port, routes its configured upstream to `http://backend:3000`, keeps backend/database internal, and declares the local PostgreSQL data volume.
- Added `scripts/verify-contact-runtime.sh`. The script validates the Compose file, starts the composition, discovers the ephemeral frontend address, opens Firefox through `playwright-cli`, runs the lifecycle assertions, exercises a paused backend for pending state, stops the backend for the genuine failure state, queries the local database for duplicate records, and traps exit to remove containers, volumes, orphans, and its browser session. It also provides `VERIFY_CLEANUP_FAILURE=1` to exercise cleanup after an intentional browser assertion failure.
- Added `tests/browser/contact-runtime.mjs` for initial form content, required/invalid validation, accepted name boundaries, malformed email, accepted 254-character email, rejected 255-character email, success confirmation, and return-to-empty-form behavior.
- Added `tests/browser/contact-runtime-pending.mjs` and the adjacent script assertion for a disabled, visibly loading `Sending Message...` control while the backend is paused.
- Added `tests/browser/contact-runtime-failure.mjs` for the exact required failure message, retained form values, visible form, and absent confirmation after backend unavailability.
- Added `tests/browser/contact-runtime-duplicates.mjs` for two successful identical submissions and presentational navigation on confirmation. The verification script then asserts two matching local PostgreSQL records.
- `build-manifest.json`: no Test Task change. Its current image reference is `studio-contact-backend:local` and is consumed verbatim by `compose.yaml`.
- Backend application source and packaging: no Test Task changes.

### Frontend repository

- Corrected `nginx/default.conf.template` after composed-runtime reproduction: `proxy_pass ${BACKEND_UPSTREAM}/;` removes the `/api/` prefix when forwarding, so browser-origin `/api/submissions` reaches the OpenAPI `POST /submissions` provider path.
- Updated the README to document the resulting forwarding behavior.
- `build-manifest.json`: no Test Task change. Its current image reference is `tool-frontend:frontend-contact-submission-flow-review` and is consumed verbatim by `compose.yaml`.
- No frontend test or other application-source changes were committed by this Test Task.

## Defects And Fixes

- The composed frontend initially forwarded `/api/submissions` unchanged, which did not match the required backend `POST /submissions` path. The Test Task corrected the frontend Nginx proxy with the trailing slash and documented it. No further corrections are permitted in this Test Candidate review.

## Verification Record

- The committed Task provides the successful Firefox browser verification and teardown outcome required by its completion statement. Its assertions cover designed initial and confirmation views, field validation and boundaries, invalid request prevention, held-request loading/disabled behavior, live success, controlled failure with exact message and retained values, duplicate persistence, reset, and presentational navigation.
- The suite exercises the browser-visible integration through the configured local API base URL and the OpenAPI `createSubmission` operation as JSON `POST /submissions`.
- The Task's `EXIT` trap runs `docker compose down --volumes --remove-orphans` for both successful and failing execution paths, including the intentional cleanup-failure path.
- This review deliberately ran no tests, lint/type checks, application builds, Docker or Compose commands, or `playwright-cli`, as required for a Test Candidate. It relied on the Test Task's successful browser verification and cleanup outcome.
