# Delivery Review: deploy-studio-contact-application

## Candidate

- Delivery unit: `deploy-studio-contact-application` / Compose the STUDIO application runtime.
- Backend repository: `https://github.com/lucacimino-reply/tool-backend.git`.
- Frontend repository (read-only evidence): `https://github.com/lucacimino-reply/tool-frontend.git`.
- Backend base: `b4b8cc803e983a8f35617fcdc7514e9de5fa1c25`.
- Candidate composition commit: `231e3344a69becd9b59441a87807c16902077c12`.
- Review correction commit: `5630d926d20038908f503e58117704f8f60a0f96`.
- Frontend evidence commit: `582a1a585acc80c601ef43581ed97d182d58a4e6`.
- Task: `compose-application`.
- Agent Content release: `agent-content-v11` (`797f434fb8f5a4e3ca7cce4b4b9a63ff9508701b`).

## Authoritative Evidence

- `context/prd.md`, `context/design-description.md`, and both indexed design renders were reviewed. This deploy unit has no directly owned requirement IDs or design references.
- `context/openapi-spec.json` was reviewed. This deploy unit has no listed OpenAPI operations; its documented same-origin proxy forwards the browser's `POST /contact-submissions` request unchanged.
- `context/tasks/compose-application.md` defines the complete deploy scope and acceptance criteria.
- `build-manifest.json` in the delivered frontend and backend candidates defines the required application images: `studio-contact-frontend:render-submission-confirmation` and `tool-backend:contact-submission-api`.
- The delivered frontend runtime contract documents port `8080` and `BACKEND_UPSTREAM` for an unchanged same-origin `/contact-submissions` proxy. The backend runtime contract documents `DATABASE_URL`, PostgreSQL, and listener port `3000`.

## Review And Corrections

- Reviewed the backend base-to-candidate diff: the original candidate added only root `compose.yaml`. The frontend evidence commit has no supplied-base diff and was inspected read-only.
- Confirmed the final file has exactly `frontend`, `backend`, and `database` services. Only `frontend` publishes port `8080`; backend and database remain on the default internal Compose network.
- Confirmed both application service `image` values exactly match their committed build manifests and that no `build` directive is present.
- Confirmed `BACKEND_UPSTREAM: http://backend:3000` uses the documented frontend reverse proxy and documented backend listener, so the browser calls same-origin `/contact-submissions` rather than resolving a Compose hostname or depending on an undocumented CORS policy.
- Confirmed PostgreSQL is the backend's documented runtime dependency. No named volume was added because the backend provides no documented persistent-storage mount path; adding one would guess a contract.
- Replaced generic `postgres` credentials and database name with self-contained `studio_demo_user`, `demo_only_studio_password`, and `studio_contact_demo` values. These values are deliberately fake and demo-only while keeping `DATABASE_URL` and PostgreSQL initialization aligned.
- No application code, Dockerfiles, manifests, build inputs, or frontend files were changed. The backend boundary tests from the delivered backend candidate cover the 16 KiB body limit before validation and persistence; this composition exposes no additional public application boundary beyond the frontend port.

## Verification

- `docker compose -f compose.yaml config` passed under an empty environment except `PATH` and `HOME`. The rendered configuration contains all three services, exact application images, inline runtime variables, frontend port `8080`, and no unresolved interpolation.
- Reviewed the rendered Compose configuration and source after the correction: no application `build` directive, external interpolation, published backend/database port, unsupported proxy/CORS configuration, storage-path guess, or real credential is present.
- Reviewed both build manifests, runtime documentation, Dockerfiles, frontend Nginx proxy template, backend listener configuration, and the backend route source. No image was built, pulled, inspected, run, or started; no container, network, or volume was created.
- `git diff --check` passed for the correction. The review record is the only additional final-review artifact required by the governing review instruction.
