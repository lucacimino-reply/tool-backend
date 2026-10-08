# Delivery Review: backend-submission-and-capacity

## Review identity and scope

- Delivery unit: `backend-submission-and-capacity` — Accept valid contact submissions within capacity.
- Delivery type: backend. Reviewed only the assigned Backend Repository; the frontend repository was not required for this Candidate review.
- Task: `implement-contact-submission-capacity`.
- Repository: `https://github.com/lucacimino-reply/tool-backend.git`.
- Base commit: `e4e6a264ab8f93f537693f2aa276adef36921b28`.
- Supplied Candidate head: `275b8eafa95a5dcb9f6d882cab615c67c942db54`.
- Review correction commit: `696ea2f1c5a51a7f8ef98d6003281135ae2b142a`.
- Agent Content provenance: release tag `agent-content-v9`, commit `15ca72856150b1736bea088f99f0ffb39dc4ff71`.

The base contains only `README.md`. I inspected the complete base-to-Candidate change and the resulting application, tests, configuration, migrations, dependency lock, documentation, and image packaging. The product PRD and Task are authoritative; Requirements Review and repository analyses were used as supporting evidence.

## Evidence and obligations

- Product requirements: `context/prd.md`, especially REQ-001, REQ-004, REQ-005, REQ-006, REQ-007, and REQ-008.
- Executable Task: `context/tasks/implement-contact-submission-capacity.md`, including its behavior, implementation constraints, and acceptance/verification criteria.
- Supporting product analyses: `context/requirements-review/requirements.md`, `frontend.md`, and `backend.md`.
- Supporting repository analyses: `context/analysis/tool-backend-b5ed4fdf.md` and `tool-frontend-711fa136.md`.
- Design evidence: `context/design/description.md` and `source.json`. The Task lists no `designReferences`; there are no design renders to compare for this backend Candidate. No visual inspection was required.
- No separate API specification is indexed and the Task lists no OpenAPI operations. The backend README is therefore the source for the interface this Task was required to settle; no operation IDs were assumed.

The required backend outcomes are satisfied: REQ-001's backend scope adds no authentication, authorization, or out-of-scope integration; REQ-004 validation occurs before storage; REQ-005 stores duplicates as distinct records and preserves submitted values; REQ-006 serializes service-wide rolling-window admission and counts duplicates; REQ-007 failures do not report success; and REQ-008 returns submitted values only after commit. The Task's completion statement is met by the passing server-side outcome and boundary tests below.

The client-consumed contract is `POST /api/submissions` with a JSON `{name, email}` body. It documents `201` with stored values, `400` field validation or malformed JSON, `413` oversized JSON, `415` unsupported media type, `429` capacity rejection, and `500` persistence failure. The product's exact generic failure copy remains a client presentation concern; capacity and persistence rejection are non-success responses suitable for that mapping. The service accepts identical duplicates and only returns success after commit.

The 365-day retention/deletion lifecycle is not implemented here: the Task explicitly assigns it to the separate backend-submission-retention unit. This is not an omitted obligation of this Candidate.

## Defects and corrections

- The JSON parser was global and only parsed JSON media types, so non-JSON request bodies bypassed its finite byte limit. There was no focused HTTP boundary coverage proving oversized requests were rejected before submission behavior. The submission route now requires `application/json` and applies the strict 16 KiB parser before the controller. Unsupported media types receive a deliberate `415`; malformed JSON and oversized JSON receive documented `400` and `413` outcomes. Tests prove an exactly-at-limit body reaches validation/storage, a body one byte over is rejected without storage, and unsupported or malformed requests do not call storage.
- The original image build ran `npm ci` in Docker, which failed with network disabled despite the lockfile-pinned dependencies already installed in the assigned repository. The Dockerfile now compiles from that repository-local dependency tree, prunes development dependencies offline, and copies only production dependencies plus compiled output to the version-pinned runtime stage. The README documents dependency preparation and the offline image command. The root `build-manifest.json` remains `tool-backend:local`, matching the successfully built image.

## Verification

- `npm test`: passed, 11/11 tests. This covers valid values and boundaries, invalid values before storage, duplicates, rolling-window capacity and recovery, concurrent capacity admission through an isolated PostgreSQL-protocol test double, failed persistence, JSON byte boundaries, unsupported media type, and malformed JSON. The suite uses isolated in-memory/fake storage; it does not claim to exercise a live PostgreSQL server.
- `npm run build`: passed with the repository's strict TypeScript configuration.
- `npm ls --depth=0`: passed; installed direct dependencies match the exact package manifest versions (`express` 5.1.0, `pg` 8.16.3, `zod` 4.1.11; TypeScript 5.9.3 and declared type packages).
- `docker build --network=none --tag tool-backend:local .`: passed without starting a container. Final inspected image ID: `sha256:fa86a55c830f87d5e8bd40fb2678bbc11dc7da97c81b6a8a085e9086e0dc0325`.
- `docker image inspect`: confirmed tag `tool-backend:local`, runtime user `node`, Node base version `22.21.0`, and direct compiled-server command `node --env-file-if-exists=.env dist/server.js`.
- `git diff --check`: passed before committing the corrections.

No live database or frontend application was started or contacted. Docker build instructions ran with networking disabled and used the locally cached pinned Node base image; the built image was not run.
