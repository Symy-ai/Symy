# End-to-end tests

These Playwright tests run against a real Symy environment and require a test account.

## Configure

Copy `.env.example` to `.env` and fill in the E2E values:

| Variable | Required | Purpose |
| --- | --- | --- |
| `E2E_EMAIL` | Yes | Test-account email used to sign in through the UI. |
| `E2E_PASSWORD` | Yes | Test-account password. |
| `E2E_SUPABASE_URL` | For `p0-a-gacha-crash` | Supabase project URL used by the test-state reset helpers. |
| `E2E_SUPABASE_ANON_KEY` | For `p0-a-gacha-crash` | Supabase anon key used by the test-state reset helpers. |
| `E2E_BASE_URL` | No | Target URL. Omit it to test the local app. |

Values already set in your shell take precedence over `.env`. Never commit real credentials.

## Run locally

```bash
npm ci
npx playwright install --with-deps chromium
npx playwright test
```

When `E2E_BASE_URL` is omitted, Playwright starts `npm run dev` on port 3000 and reuses an already-running local server; set `E2E_BASE_URL` to run against a deployed environment instead.

## CI

`.github/workflows/e2e-tests.yml` runs the same suite against the deployed environment from repo secrets (`E2E_EMAIL` / `E2E_PASSWORD`) and skips itself when those secrets are not configured.

## Transparency suite (mock backend)

`e2e/transparency.spec.ts` verifies the `/transparency` build-in-public pages end to end (zh/en, finance, OG card, share intent, subscribe, degraded branch). Page data is server-rendered by a direct call to the aggregation loaders, so browser-level route interception cannot control the numbers — a small mock PostgREST upstream does instead:

```bash
node e2e/fixtures/mock-postgrest.mjs &            # deterministic PostgREST stub on 127.0.0.1:54399
E2E_TRANSPARENCY_MOCK=1 \
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 \
SUPABASE_SERVICE_ROLE_KEY=sb_secret_e2e_local_mock \
npx playwright test e2e/transparency.spec.ts --workers=1
```

Without `E2E_TRANSPARENCY_MOCK=1` the file skips itself, so deployed-environment CI runs stay green. Do not set `NEXT_PUBLIC_SUPABASE_ANON_KEY` for this run: with only the two variables above, the auth proxy skips itself and the mock only needs to serve `/rest/v1/*`.

## Inventory suite (mock backend + fake auth)

`e2e/inventory.spec.ts` verifies the inventory user journey (list rendering with time groups/category/source tags, empty & disabled states, delete confirm flow with optimistic update and failure rollback, and the "no manual add" red line). The card only renders for signed-in users inside the settings overlay, so this run also needs a fake auth upstream — start the same mock with `MOCK_POSTGREST_AUTH=1` and let the product's own login form sign in against it:

```bash
MOCK_POSTGREST_AUTH=1 node e2e/fixtures/mock-postgrest.mjs &   # + fake GoTrue /auth/v1/*
E2E_INVENTORY_MOCK=1 \
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_e2e_local_mock \
SUPABASE_SERVICE_ROLE_KEY=sb_secret_e2e_local_mock \
npx playwright test e2e/inventory.spec.ts --workers=1
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` must be set here (unlike the transparency suite): the browser client needs `isSupabaseConfigured()` true to run the login/session chain. The mock's auth endpoints are gated behind `MOCK_POSTGREST_AUTH=1`, so transparency-only runs are unaffected. `/api/inventory` itself is intercepted per-test with `page.route`, so no inventory data lives in the mock.
