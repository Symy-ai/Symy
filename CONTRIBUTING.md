# Contributing to Symy

**少买一点，多活一点。Buy less. Live more.**

Thanks for considering a contribution. Symy is an open companion for sustainable consumption, and every improvement — code, docs, i18n, design — helps people pause and choose better.

## Development environment

Requirements:

- **Node.js 22** (the version pinned in [`.nvmrc`](.nvmrc) — run `nvm use` if you use nvm)
- npm (bundled with Node)

```bash
git clone https://github.com/Symy-ai/Symy.git
cd Symy
npm install
cp .env.example .env.local
```

Then fill in [`.env.local`](.env.example) — start with the Core, Supabase, and Letta groups; the other groups are only needed for the matching feature. Never commit real values.

| Group | Key variables | Needed for |
| --- | --- | --- |
| Core app | `NEXT_PUBLIC_APP_URL`, `DATABASE_URL`, `PAYLOAD_SECRET`, `ENCRYPTION_MASTER_KEY`, `ADMIN_API_KEY`, `CRON_SECRET` | The base application |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (plus aliases) | Auth, database, and storage |
| Letta | `LETTA_API_KEY`, `LETTA_BASE_URL`, `LETTA_MODEL`, `LETTA_AGENT_*` | The companion persona and its long-term memory |
| Hands MCP | `SYMY_HANDS_URL`, `SYMY_HANDS_SECRET`, `MCP_API_SECRET`, `MCP_ALLOWED_ORIGINS` | Talking to the [Symy-ai/Shopping](https://github.com/Symy-ai/Shopping) service |
| LLM & embeddings | `LLM_GATEWAY_URL`, `LLM_GATEWAY_KEY`, `EMBEDDING_*`, `UPSTREAM_LLM_*` | Memory retrieval (RAG) and model routing |
| Optional | `VAPID_*` (web push), `GOOGLE_*` (Google sign-in), `IMAP_*` (email scanning), `POSTHOG_*` / `SENTRY_*` (observability), `OPENAI_IMAGE_*` / `AGNES_API_KEY` (illustrations) | The matching feature only |

Start the dev server:

```bash
npm run dev   # http://localhost:3000
```

## Tests and checks

CI runs all three of these on every pull request, and all must be green:

```bash
npm run test                                # Vitest — baseline snapshot: 5,762 tests across 457 files
NODE_OPTIONS='--max-old-space-size=4096' npx tsc --noEmit   # TypeScript type check
npx eslint src/ --max-warnings=0            # ESLint — zero warnings allowed
```

If your change moves a Vitest snapshot intentionally, update it deliberately (`npx vitest -u`) and explain why in the PR — never commit a silently shrunk test baseline.

## Commit conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>
```

Common types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`. Examples from this repo:

```
feat(chat): stream guardian replies token by token
fix(i18n): align zh copy with the honor-not-shame framing
docs: expand README with architecture and roadmap
```

## Pull request process

**This open-source repository lands every change through reviewed pull requests — direct pushes to the default branch are not used here.** (This is deliberately stricter than our internal workflow, where maintainers may push directly; in the open-source repo, PRs are the only path.)

1. Fork the repository (or branch off the default branch if you are a collaborator) and make your change in a feature branch.
2. Keep pull requests small and focused — one responsibility per change, small files, one concern per module.
3. Make sure all three checks from *Tests and checks* pass locally before pushing.
4. Open the PR with a short description of **what** changed and **why**; link any related issue.
5. A maintainer will review; address feedback with additional commits, then squash-merge.

Additional ground rules:

- User-facing copy ships in both **Chinese and English** (`src/i18n/messages/zh.json` / `en.json`), keeping the brand voice: zh = 少买一点，多活一点。/ en = Buy less. Live more.
- Never commit secrets, real user data, debug scripts, or `.bak` backup files.
- Never blame the user in product copy — the manipulator is the growth machine, not the person.
- Don't fabricate numbers (carbon footprints, savings claims); qualitative and honest beats quantitative and invented.

## License

By contributing, you agree that your contributions are licensed under the [GNU Affero General Public License v3.0](LICENSE).
