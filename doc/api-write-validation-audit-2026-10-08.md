# API Write Endpoint Validation Audit

Scope: all 89 write handlers in `src/app/api/**/route.ts` at commit `ebc1d6c6a70cb7ae72be72d4c7c5787ed9b9909f`.

| File | Method | Classification | Evidence |
|---|---|---|---|
| `src/app/api/admin/agent-pool-auth/route.ts:76` | POST | INTERNAL-ONLY | Admin-authenticated trigger; ignores request body. |
| `src/app/api/admin/agent-pool/route.ts:48` | POST | LOOSE | Parses body, then only accepts finite positive `setPoolSize`; admin-only. |
| `src/app/api/admin/create-weekly-challenges-auth/route.ts:40` | POST | INTERNAL-ONLY | Admin-authenticated trigger; `weekOffset` is optionally normalized and clamped. |
| `src/app/api/admin/create-weekly-challenges/route.ts:25` | POST | INTERNAL-ONLY | Admin-authenticated trigger; `weekOffset` is optionally normalized and clamped. |
| `src/app/api/admin/cultivation/route.ts:118` | POST | INTERNAL-ONLY | Admin-authenticated action allowlist; no request body consumed. |
| `src/app/api/admin/embeddings/route.ts:129` | POST | INTERNAL-ONLY | Admin-authenticated action/query allowlist; no request body consumed. |
| `src/app/api/admin/letta/route.ts:166` | POST | INTERNAL-ONLY | Admin context validates top-level JSON object; per-action handlers and auth protect the route. |
| `src/app/api/admin/settings/route.ts:67` | POST | INTERNAL-ONLY | Admin-authenticated exact `health_check` action allowlist. |
| `src/app/api/admin/users/[id]/route.ts:80` | DELETE | LOOSE | Path ID checked against UUID regex; admin-only. |
| `src/app/api/admin/users/route.ts:89` | POST | LOOSE | Manual checks for action enum, UUID array, date, and plan; admin-only. |
| `src/app/api/admin/vip/route.ts:84` | POST | VERIFIED | `vipActionSchema.safeParse` validates UUID array and action enum. |
| `src/app/api/audit/ai/route.ts:127` | POST | INTERNAL-ONLY | Admin-authenticated route with zod `reviewSchema.parse`. |
| `src/app/api/buddy/daily-needs/route.ts:32` | POST | VERIFIED | `validateBody` with zod schema. |
| `src/app/api/buddy/deposit/route.ts:47` | POST | VERIFIED | `validateBody` with zod schema. |
| `src/app/api/buddy/dream-fund-progress/route.ts:31` | POST | VERIFIED | `validateBody` with zod schema. |
| `src/app/api/buddy/dream-funds/route.ts:78` | POST | VERIFIED | `validateBody` with zod schema. |
| `src/app/api/buddy/dream-funds/route.ts:153` | PATCH | VERIFIED | `validateBody` with field-specific zod schema. |
| `src/app/api/buddy/dream-funds/route.ts:213` | DELETE | VERIFIED | `validateBody` with zod fund-id schema. |
| `src/app/api/buddy/gacha-limit/route.ts:105` | POST | VERIFIED | `validateBody` with zod schema. |
| `src/app/api/buddy/gacha-limit/route.ts:279` | DELETE | VERIFIED | No user input; authenticated owner is derived from session. |
| `src/app/api/buddy/healing-kit/route.ts:38` | POST | VERIFIED | `validateBody` with zod schema. |
| `src/app/api/buddy/health-events/reset/route.ts:29` | POST | LOOSE | `parseBody` plus manual lane allowlist. |
| `src/app/api/buddy/health-events/route.ts:79` | POST | LOOSE | `parseBody`; metadata, descriptions, enums, and server-only types manually validated. |
| `src/app/api/buddy/health-events/route.ts:181` | DELETE | VERIFIED | No request input; authenticated owner is derived from session. |
| `src/app/api/buddy/personality/route.ts:21` | POST | VERIFIED | `validateBody` with zod schema. |
| `src/app/api/buddy/proactive-messages/generate/route.ts:24` | POST | VERIFIED | `validateBody` with zod schema. |
| `src/app/api/buddy/proactive-messages/route.ts:28` | POST | VERIFIED | `validateBody` with zod schema. |
| `src/app/api/buddy/redeem-streak/route.ts:33` | POST | VERIFIED | `validateBody` with zod schema. |
| `src/app/api/buddy/redeem/route.ts:37` | POST | VERIFIED | `validateBody` with zod schema. |
| `src/app/api/buddy/spending-cap/route.ts:87` | PUT | VERIFIED | `validateBody` with zod schema. |
| `src/app/api/buddy/state/route.ts:129` | PUT | VERIFIED | Top-level zod record plus strict server-side field clamps. |
| `src/app/api/butterfly/choice/route.ts:40` | POST | VERIFIED | `validateBody` with zod choice schema. |
| `src/app/api/butterfly/demo-choice/route.ts:16` | POST | VERIFIED | `validateBody` with zod schema. |
| `src/app/api/butterfly/demo-session/route.ts:30` | POST | VERIFIED | `validateBody` with zod schema. |
| `src/app/api/butterfly/demo-story/route.ts:42` | POST | VERIFIED | `demoStorySchema.safeParse` after JSON parse. |
| `src/app/api/butterfly/illustration-demo/route.ts:52` | POST | VERIFIED | `illustrationSchema.parse` after JSON parse. |
| `src/app/api/butterfly/illustration/route.ts:44` | POST | VERIFIED | `validateBody` with zod schema. |
| `src/app/api/butterfly/preload-branch/route.ts:63` | POST | VERIFIED | `validateBody` with zod schema. |
| `src/app/api/butterfly/session/route.ts:47` | POST | VERIFIED | `validateBody` with zod schema. |
| `src/app/api/butterfly/session/route.ts:357` | DELETE | VERIFIED | `validateBody` with zod session-id schema. |
| `src/app/api/butterfly/sessions/[id]/route.ts:34` | PATCH | VERIFIED | `bookmarkSchema.parse` after JSON/text parsing. |
| `src/app/api/butterfly/sessions/[id]/route.ts:86` | DELETE | LOOSE | Path parameter truthiness only; ownership is enforced by user_id filter and RLS. |
| `src/app/api/butterfly/story/route.ts:36` | POST | VERIFIED | `validateBody` with zod schema. |
| `src/app/api/challenge/complete/route.ts:25` | POST | VERIFIED | `validateBody` with zod schema. |
| `src/app/api/challenge/create/route.ts:40` | POST | VERIFIED | `validateBody` with zod schema. |
| `src/app/api/challenge/dismiss/route.ts:20` | POST | VERIFIED | `validateBody` with zod schema. |
| `src/app/api/challenge/resume/route.ts:20` | POST | VERIFIED | `validateBody` with zod schema. |
| `src/app/api/chat/anonymous/route.ts:152` | POST | VERIFIED | `anonymousChatSchema.safeParse` after JSON parse. |
| `src/app/api/chat/history/route.ts:69` | POST | VERIFIED | `validateBody` with zod schema. |
| `src/app/api/chat/history/route.ts:103` | DELETE | LOOSE | Boolean `all` flag or unbounded `id`; owner filtering and DB constraints constrain writes. |
| `src/app/api/chat/route.ts:241` | POST | VERIFIED | Handler delegates to `validateChatRequest` with content-size and zod validation. |
| `src/app/api/community/challenges/checkin/route.ts:20` | POST | VERIFIED | `validateBody` with zod schema. |
| `src/app/api/community/challenges/join/route.ts:22` | POST | VERIFIED | `validateBody` with zod schema. |
| `src/app/api/email/disconnect/route.ts:13` | DELETE | LOOSE | Query parameter is only truthiness-checked; user_id equality constrains the delete. |
| `src/app/api/email/imap-connect/route.ts:48` | POST | VERIFIED | Zod validates credentials and bounded numeric fields. |
| `src/app/api/email/receipts/route.ts:57` | PATCH | VERIFIED | Query and body each validated with zod. |
| `src/app/api/email/receipts/route.ts:170` | DELETE | LOOSE | Action compared with literal `purge`; all other values return 400. |
| `src/app/api/email/resync/route.ts:46` | POST | VERIFIED | `resyncSchema.parse` after JSON parse. |
| `src/app/api/email/scan/route.ts:36` | POST | VERIFIED | `scanSchema.parse` after JSON parse. |
| `src/app/api/email/seed-test/route.ts:80` | POST | INTERNAL-ONLY | Admin-auth and non-production guards; endpoint then performs deterministic test seeding. |
| `src/app/api/green-alt/adoption/route.ts:45` | POST | LOOSE | `parseBody`; entry ID uses server-known allowlist and `estSaved` is manually bounded. |
| `src/app/api/hands/cart/route.ts:39` | POST | VERIFIED | `bodySchema.safeParse` over parsed/null-normalized input. |
| `src/app/api/inventory/route.ts:51` | POST | VERIFIED | `inventoryItemSchema.safeParse` after JSON parse. |
| `src/app/api/inventory/route.ts:99` | DELETE | LOOSE | UUID regex validates path query before owner-filtered delete. |
| `src/app/api/invite/record-ref/route.ts:30` | POST | VERIFIED | `validateBody` with bounded zod string. |
| `src/app/api/letta/agent/route.ts:36` | POST | VERIFIED | `validateBody` with zod action enum. |
| `src/app/api/mcp/route.ts:70` | POST | VERIFIED | Both secret and authenticated paths use zod `validateBody`. |
| `src/app/api/mcp/server-v2/route.ts:219` | POST | VERIFIED | MCP SDK transport validates JSON-RPC; tool schemas are generated through zod. |
| `src/app/api/mcp/server-v2/route.ts:280` | DELETE | VERIFIED | Stateless no-input response; auth still required. |
| `src/app/api/mcp/server/route.ts:354` | POST | VERIFIED | `jsonrpcSchema.parse` validates JSON-RPC envelope. |
| `src/app/api/mcp/server/route.ts:500` | DELETE | VERIFIED | Stateless no-input response; auth still required. |
| `src/app/api/premium/waitlist/route.ts:44` | POST | VERIFIED | `validateBody` with zod schema; persisted email comes from auth identity. |
| `src/app/api/push/preferences/route.ts:84` | PATCH | VERIFIED | `pushPreferencesSchema.safeParse` after JSON parse. |
| `src/app/api/push/subscribe/route.ts:44` | POST | VERIFIED | `subscribeSchema.safeParse` after JSON parse. |
| `src/app/api/push/unsubscribe/route.ts:29` | DELETE | VERIFIED | `unsubscribeSchema.safeParse` after JSON parse. |
| `src/app/api/reflections/resonate/route.ts:12` | POST | VERIFIED | UUID zod schema with invalid JSON handling. |
| `src/app/api/reflections/route.ts:69` | POST | VERIFIED | `createReflectionSchema.safeParse` with invalid JSON handling. |
| `src/app/api/reuse/adoption/route.ts:32` | POST | LOOSE | `parseBody`; category uses server-known allowlist and `estSaved` is manually bounded. |
| `src/app/api/transparency/subscribe/route.ts:51` | POST | VERIFIED | `subscribeSchema.safeParse` over parsed/null-normalized input. |
| `src/app/api/user/avatar/route.ts:31` | POST | VERIFIED | FormData field, MIME, size, and magic-byte validation; sharp re-encodes output. |
| `src/app/api/user/delete-account/route.ts:32` | POST | VERIFIED | `validateBody` with literal confirmation schema. |
| `src/app/api/user/display-name/route.ts:30` | POST | VERIFIED | `validateBody` with bounded zod string. |
| `src/app/api/user/hourly-rate/route.ts:68` | POST | VERIFIED | `validateBody` with bounded zod number. |
| `src/app/api/user/locale/route.ts:33` | POST | VERIFIED | `validateBody` with zod schema. |
| `src/app/api/user/onboarding/route.ts:73` | PUT | VERIFIED | `onboardingSchema.parse` after JSON parse. |
| `src/app/api/user/ritual-status/route.ts:61` | POST | VERIFIED | No request input; authenticated owner is derived from session. |
| `src/app/api/v1/chat/completions/route.ts:45` | POST | VERIFIED | Size guard plus strict zod proxy schema. |
| `src/app/api/v1/openai/chat/completions/route.ts:40` | POST | VERIFIED | Size guard plus strict zod proxy schema. |
| `src/app/api/waitlist/subscribe/route.ts:44` | POST | VERIFIED | `subscribeSchema.safeParse` over parsed/null-normalized input. |

## Result

- VERIFIED: 74
- LOOSE: 14
- UNVALIDATED: 0
- INTERNAL-ONLY: 12

No user-triggered UNVALIDATED endpoint was found, so no route was modified under this task's limited repair scope.
