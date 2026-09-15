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
