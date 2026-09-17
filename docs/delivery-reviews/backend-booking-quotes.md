# Delivery Review: backend-booking-quotes

## Candidate identity

- Delivery unit: `backend-booking-quotes` (Authoritative booking quotes)
- Delivery type: backend
- Reviewed repository: `https://github.com/lucacimino-reply/tool-backend.git`
- Base commit: `20ed581f08dd27b8d3db40dc0b74fc4bb94e73be`
- Candidate commit: `294a2153ef8f1b1efda9ffa5579587ef2c3d81ae`
- Agent Content release: `agent-content-v14` at `58f6df9e56ae1ddf4c27c2b098ebe5a8985e4d2b`

## Scope and evidence

Reviewed `POST /api/booking-quotes`, the authenticated `clean_session` boundary, promotion persistence, pricing, request validation, and repository-local packaging. The runtime's `/api` prefix follows the active Node/Express delivery reference so the frontend proxy can forward the OpenAPI route without rewriting.

Authoritative evidence reviewed:

- `context/prd.md`: REQ-005, REQ-007, REQ-008, REQ-009, and REQ-010.
- `context/openapi-spec.json`: `quoteBooking`, `BookingQuoteRequest`, `BookingQuote`, `BillingSnapshot`, `Money`, `ServiceSelection`, `ArrivalSelection`, `QuoteDetails`, `PromoCodeInput`, `Problem`, and `ValidationProblem`.
- Task specifications: `build-booking-quote-pricing-and-promo-foundation` and `expose-authenticated-booking-quote-operation`.
- `context/design-description.md` and its indexed renders: no design references are assigned to this backend unit, so no visual acceptance comparison applies.
- Repository analyses for the backend and frontend, used only as supporting evidence.

The candidate diff from the supplied base added the quote feature, immutable promotion migration, API tests, and the application route registration. The wider history from the Task baseline was also inspected to confirm the quote feature integrates through the existing session-authentication entry point.

## Review result

The candidate satisfies the assigned observable completion: authenticated valid selections return canonical two-decimal USD billing snapshots, invalid booking and promo inputs return field-specific `422` problems, and quote processing does not inspect or reserve scheduling state.

- Promotion migration constrains and seeds exactly one active `CLEAN10` promotion worth `10.00` USD.
- Request validation enforces closed objects, supported enums, room bounds, discriminated Flexible/fixed arrival shapes, all 17 fixed times, unique extras, and the three-extra maximum before pricing.
- Promo normalization trims before the 64-character and case-insensitive eligibility checks. Invalid, empty, and overlong values return `422`; quote and promotion state are read-only.
- Pricing uses integer cents and explicit half-up operations for every required stage. Returned values conform to the OpenAPI Money string format.
- The global JSON parser limits request bodies to `16kb`; the error handler returns a deliberate OpenAPI-compatible `422` before route/controller quote behavior. The focused API regression test covers this externally reachable resource boundary.
- Equivalent authenticated requests remain non-exclusive; no date, availability, capacity, conflict, reservation, or time-zone conversion behavior exists in the quote path.

## Defects corrected

- Container startup bypassed the required native `--env-file-if-exists=.env` configuration loading path. The final image now invokes compiled server code with that option while remaining usable when `.env` is absent.
- Startup migration lock acquisition was unbounded and undocumented. Added bounded `MIGRATION_LOCK_TIMEOUT_MS` configuration, applied it before acquiring the PostgreSQL advisory lock, documented it in `.env.example` and `README.md`, and covered its configured bounds.
- Added an API-level regression test confirming oversized JSON is rejected as a `422 ValidationProblem` before quote evaluation.

## Verification

- `git diff --check`: passed.
- `npm test`: passed, 4 files and 77 tests. Covers pricing tables, monetary rounding, promotion seeding and normalization, authentication, successful and rejected quote requests, all fixed arrival values, selection constraints, promo failures, repeated non-exclusive requests, and the oversized-body boundary.
- `npm run build`: passed with strict TypeScript compilation.
- `docker build -t tool-backend:latest .`: passed without starting a container. The image is non-root and has the expected command `node --env-file-if-exists=.env dist/server.js`.
- `build-manifest.json` records the successfully built `tool-backend:latest` image.
