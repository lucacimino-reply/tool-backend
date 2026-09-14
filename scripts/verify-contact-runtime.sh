#!/usr/bin/env bash
set -euo pipefail

cleanup() {
  playwright-cli -s=contact-runtime close >/dev/null 2>&1 || true
  docker compose down --volumes --remove-orphans
}
trap cleanup EXIT

docker compose down --volumes --remove-orphans
docker compose config >/dev/null
docker compose up -d
playwright-cli close-all >/dev/null 2>&1 || true

frontend_address=$(docker compose port frontend 8080)
frontend_port=${frontend_address##*:}
frontend_url="http://127.0.0.1:${frontend_port}"

for attempt in $(seq 1 20); do
  if playwright-cli -s=contact-runtime open --browser=firefox "${frontend_url}" >/dev/null 2>&1; then
    break
  fi
  if [ "${attempt}" = 20 ]; then
    docker compose ps
    docker compose logs
    exit 1
  fi
done

if [ "${VERIFY_CLEANUP_FAILURE:-}" = "1" ]; then
  playwright-cli -s=contact-runtime run-code "async page => { throw new Error('intentional cleanup verification failure') }"
fi

playwright-cli -s=contact-runtime run-code --filename=tests/browser/contact-runtime.mjs
docker compose pause backend
playwright-cli -s=contact-runtime run-code --filename=tests/browser/contact-runtime-pending.mjs
playwright-cli -s=contact-runtime run-code "async page => { const button = page.getByRole('button', { name: 'Sending Message...' }); if (!(await button.isDisabled())) throw new Error('pending submission did not disable the control') }"
docker compose unpause backend
playwright-cli -s=contact-runtime run-code "async page => { await page.getByRole('heading', { name: 'Thank you!' }).waitFor() }"
playwright-cli -s=contact-runtime run-code "async page => { await page.getByRole('button', { name: 'Back to Home' }).click() }"
docker compose stop backend
playwright-cli -s=contact-runtime run-code --filename=tests/browser/contact-runtime-failure.mjs
docker compose start backend

for attempt in $(seq 1 20); do
  if playwright-cli -s=contact-runtime reload >/dev/null 2>&1; then
    break
  fi
  if [ "${attempt}" = 20 ]; then
    docker compose ps
    docker compose logs
    exit 1
  fi
done

playwright-cli -s=contact-runtime run-code --filename=tests/browser/contact-runtime-duplicates.mjs
records=$(docker compose exec -T database psql --username=studio --dbname=studio --tuples-only --no-align --command "SELECT count(*) FROM submissions WHERE name = 'Duplicate browser visitor' AND email = 'duplicate-browser@example.com';")
[ "${records}" = "2" ]
