# Delivery Review: backend-submission-retention

## Reviewed scope and evidence

This review covers the backend Candidate for Delivery unit `backend-submission-retention` and Task `delete-accepted-submissions-after-365-days`. The authoritative product requirement is `REQ-009`; the Task specifies no design references and no OpenAPI operations. No separate API specification was supplied. The PRD and Task define the product obligations. The design description, all three Requirements Review analyses, and the indexed backend repository analysis were used as supporting evidence. The active backend review criteria were `.opencode/skills/delivery-backend/SKILL.md` and `references/backend-node-express.md`.

The indexed design source and description were read. The local capture manifest and render files were absent, but the Task's exact `design_references` list is empty, so no capture is required for this backend Candidate. No frontend implementation or visual behavior is claimed as reviewed. The requirements-review backend analysis was treated as product evidence, not an API contract.

## Candidate identity

| Repository | Planning revision | Candidate base commit | Supplied Candidate head |
| --- | --- | --- | --- |
| `https://github.com/lucacimino-reply/tool-backend.git` | `e4e6a264ab8f93f537693f2aa276adef36921b28` | `b14182d89f542d3851fef5fa33aa485a5ca092c8` | `54c7a50d54e0063d8b97c5f3f3c64bc5abb9ad0d` |

The full diff from the supplied Candidate base to head was inspected, followed by the current repository worktree and the expiry implementation, migration, startup path, tests, and inherited submission boundary. The worktree was clean before review documentation was added. No application correction was required; the final review commit contains this document only.

## Requirement and Task assessment

- **Completion statement / REQ-009:** Each accepted submission receives a durable, per-row expiry deadline 365 elapsed days (365 x 24 hours) after its persisted acceptance timestamp. `deleteExpired` removes rows at or after their individual deadline. The migration backfills existing rows from `submitted_at + INTERVAL '8760 hours'`, creates the non-null expiry field and index, and leaves the existing migration immutable.
- **Automatic lifecycle:** Startup runs overdue cleanup after migrations and before opening the HTTP listener. A recurring 60-second cleanup handles expiries during normal operation; restart invokes catch-up before traffic is accepted. Duplicate pairs remain independent rows and therefore have independent deadlines.
- **Task constraints:** Changes are limited to the backend repository. Existing submission validation, capacity admission, distinct duplicate storage, response behavior, and inherited image/startup packaging remain intact. No retrieval operation, expiry notification, expiry UI, or external integration was added.
- **Design references:** None are listed by the Task; accounted for as not applicable.
- **API obligations:** The Task lists no operations and there is no supplied API contract. The existing `POST /api/submissions` operation remains the submission interface and does not expose expiry data. No expiry endpoint or retrieval path was introduced.
- **Trust boundary:** JSON parsing is capped at 16 KiB before the route runs. Name and email bounds are checked before repository access. Focused HTTP tests verify overlong fields and oversized JSON return deliberate `400`/`413` errors without invoking persistence. The inherited 100-success-per-rolling-hour rule is not treated as an ingress or general resource limit.

## Findings and corrections

No defects were found in the Candidate diff or affected code paths. No application correction was necessary. Review confirmed migration ordering and startup cleanup against source; expiry, independent duplicate deadlines, restart catch-up, and scheduled cleanup are covered by deterministic repository-native tests.

The tests use isolated in-memory/fake PostgreSQL persistence and a controllable clock. They do not connect to PostgreSQL, so actual database execution of the migration and delete statement was not independently integration-tested in this review.

## Verification

| Command or check | Result |
| --- | --- |
| `npm test` | Passed: all 15 HTTP and repository tests, including pre-deadline retention, deadline deletion, independent duplicate expiry, startup catch-up, and scheduled cleanup. |
| `npm run build` | Passed: strict TypeScript production build. |
| `docker build --pull=false --tag tool-backend:delete-accepted-submissions-after-365-days .` | Passed from the backend repository build context. No container was started; BuildKit reused cached dependency and compilation layers. |
| `docker image inspect --format '{{.Id}} user={{.Config.User}} command={{json .Config.Cmd}}' tool-backend:delete-accepted-submissions-after-365-days` | Passed: image `sha256:4ee5bc2654c9fa60feb47f19faa73b1d01d411f8e6b59919021fab23bbacac23`, user `node`, command `node --env-file-if-exists=.env dist/server.js`. |
| Root `build-manifest.json` | Confirmed image name `tool-backend` and tag `delete-accepted-submissions-after-365-days`, matching the built image. |
| `git diff --check b14182d89f542d3851fef5fa33aa485a5ca092c8 54c7a50d54e0063d8b97c5f3f3c64bc5abb9ad0d` | Passed. |

An initial `--network=none` build attempt could not complete because the builder had no local npm package cache. After the operator explicitly allowed npm-registry access for the build, the repository-local image build completed successfully. No application, database, frontend repository, or other application service was contacted or started.

## Agent Content provenance

This review corresponds to Agent Content release tag `agent-content-v9` at commit `15ca72856150b1736bea088f99f0ffb39dc4ff71`.

## Review conclusion

The backend Candidate satisfies the observable completion statement, `REQ-009`, the Task's implementation constraints and acceptance criteria, its empty design/API reference lists, and the active backend architecture and verification criteria. The review document is the only review-stage change.
