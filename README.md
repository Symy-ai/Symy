# Symy

**AI 绿色消费守护 — 少买一点，多活一点。Buy less. Live more.**

Symy is an open companion for sustainable consumption. Its elephant companion helps people pause, reflect, and turn impulse purchases into choices that support a longer and freer life.

## Brain and hands

Symy follows a “brain and hands” architecture:

- **Brain:** this repository, a Next.js app whose personality companion is powered by [Letta](https://letta.com).
- **Hands:** the shopping and cart actions are provided by the [Symy-ai/Shopping MCP service](https://github.com/Symy-ai/Shopping).

## Tech stack

- Next.js
- TypeScript
- Supabase
- Letta
- Vitest

## Quick start

```bash
git clone https://github.com/Symy-ai/Symy.git
cd Symy
npm install
cp .env.example .env.local
npm run dev
```

Fill the required variables in `.env.local` before using application features.

## Tests

```bash
npm run test
```

The snapshot baseline is 5,754 Vitest tests across 456 files.

## Governance

The public design documents in [`doc/symy-lab/`](doc/symy-lab/) describe Symy's governance philosophy, symbiotic AI, and the Dao behind the project.

## License

Released under the [GNU Affero General Public License v3.0](LICENSE).
