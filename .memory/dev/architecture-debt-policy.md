---
name: architecture-debt-policy
description: 架构债管理规范 — 开发人员必读，防止架构债再积累
type: policy
---

# 架构债管理规范 (2026-06-30 架构师制定, 2026-08-04 修订 v5)

> ⚠️ 本文件是**开发人员必读**，每次开新任务前过一遍。
> 违反这些规则 = 在积累架构债 = 未来要还更多利息。
> **v5 更新**: Round 3 — Dexie→React Query 迁移已完成, buddy-sync/use-buddy-state 已删除,
>    2,225 行 dead code 清理, 文档同步现实 (原 v4 仍引用已删文件)
> **v4 更新**: Round 78 — 3 新 helper (json-helpers / letta-message-helpers / zai-sdk-types)

---

## 📜 当前状态 (2026-08-04, Round 3 更新)

| 维度 | 状态 |
|---|---|
| TypeScript 错误 | ✅ 0 (`npx tsc --noEmit`) |
| ESLint 错误 | ✅ 0 (`npx eslint src/`) |
| ESLint warnings | ✅ 0 (`npx eslint src/ --max-warnings=0`) |
| `next.config.ts` `ignoreBuildErrors` | ✅ 已关闭 |
| 内联 fetch 调用 | ~15 (SSE/FormData/auth 等合理保留) |
| 单元测试 | ✅ 2,490 tests (`npx vitest run`) |
| 架构守卫测试 | ✅ 135 tests (architecture-guards.test.ts) |
| CI workflow | ✅ `.github/workflows/ci-checks.yml` (typecheck + lint + test) |
| Pre-commit hook | ✅ `scripts/setup-precommit.sh` (tsc + ESLint on staged files) |
| 大文件 ≤800行 | ✅ **0 个超限文件** (所有非测试文件 ≤800 行) |
| 共享 helper | ✅ 11 个 (7 旧 + 3 新 Round 78 + 1 新 Round 80) |
| Buddy state 架构 | ✅ React Query (server-source-of-truth), buddy-sync/Dexie 已删除 |

---

## 🔴 硬规则 (违反 = PR 不批准)

### 1. 仓库根目录只允许以下文件
```
src/           — 应用代码
doc/           — 文档 (含 research/)
scripts/       — 构建/测试脚本
supabase/      — 数据库 migration
public/        — 静态资源
examples/      — 示例代码
.agent-ctx/    — Agent 上下文
.github/       — CI/CD 配置

# 配置文件 (白名单)
package.json, package-lock.json, bun.lock
tsconfig.json, next.config.ts, tailwind.config.ts
postcss.config.mjs, eslint.config.mjs, components.json
vercel.json, Caddyfile, .gitignore, LICENSE, README.md
worklog.md
```

⛔ **禁止**在仓库根目录放：`.mjs`/`.js`/`.py`/`.json`/`.png`/`.md` 文件（除上述白名单）
→ AI agent 搜索/抓取/生成的临时文件放 `/tmp/` 或 `tool-results/`（已 .gitignore）

⛔ **禁止**生成 `.docx` 文件 — 用户明确要求不再生成

### 2. 文件行数限制
| 类型 | 硬上限 | 超限处理 |
|------|--------|----------|
| React 组件 (.tsx) | 800 行 | 必须拆分为子组件 + custom hooks |
| Custom Hook (.ts) | 500 行 | 必须拆分为多个 hook |
| API Route (.ts) | 400 行 | 必须拆分为 parts/ 子目录 |
| Lib 工具 (.ts) | 600 行 | 必须拆分为多个文件 |

当前超限文件：**0 个** — 所有非测试文件均 ≤800 行 (2026-08-04 Round 3 确认)。

> Round 95 注: buddy-sync.ts (原 1034 行) / use-buddy-state.ts (原 960 行) 已删除, 由 use-buddy-state-rq.ts (536 行) 替代。
> Round 3 注: 10 个 dead code 文件 (2,225 行) 已删除, 守卫测试防止复活。
> 接近上限的文件 (下次关注): buddy-tab.tsx (795), use-player-actions.ts (790), page.tsx (786), use-chat-actions.ts (781)

### 3. Hooks 声明顺序 (防 TDZ)
所有 `useState`/`useRef` 必须在**第一个 `useEffect`/`useCallback` 之前**声明。
违反会导致 `ReferenceError: Cannot access 'X' before initialization`（见 BUG-334）。

```typescript
// ✅ 正确
function MyComponent() {
  const [state, setState] = useState(null);  // 先声明 state
  const ref = useRef(null);                  // 先声明 ref
  useEffect(() => { ... }, [state]);        // 再用 effect
  const handler = useCallback(() => { ... }, [state]);  // 再用 callback
}

// ❌ 错误 (TDZ)
function MyComponent() {
  useEffect(() => { ... }, [state]);  // state 在 TDZ 中!
  const [state, setState] = useState(null);
}
```

### 4. React 19 Compiler 兼容性 (2026-07-01 新增)

React 19 Compiler 严格检查以下模式, **必须遵守**:

#### 4.1 禁止在 render 中读/写 ref
```typescript
// ❌ 错误 (React 19 禁止)
function MyComponent() {
  const myRef = useRef(null);
  if (!myRef.current) myRef.current = createClient(); // render 中写 ref
  const data = myRef.current;                          // render 中读 ref
}

// ✅ 正确: 用 useMemo 缓存
function MyComponent() {
  const client = useMemo(() => createClient(), []);
}
```

#### 4.2 禁止在 effect 内同步 setState (除非标注)
```typescript
// ❌ 错误 (触发 cascading renders)
useEffect(() => {
  setVisible(true); // 同步 setState
}, []);

// ✅ 正确 A: 用 lazy initializer
const [visible, setVisible] = useState(() => readFromUrl());

// ✅ 正确 B: 用 useMemo 派生
const visible = useMemo(() => prop1 && prop2, [prop1, prop2]);

// ✅ 正确 C: 合理的 "prop → state 同步" 用 eslint-disable 标注
useEffect(() => {
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 受控表单初始化
  setForm({ name: editingItem.name });
}, [editingItem]);
```

#### 4.3 ref 在 effect 内"读-改-写"模式
```typescript
// ❌ Compiler 警告 (但合法)
useEffect(() => {
  if (lastProcessedRef.current === value) return;
  lastProcessedRef.current = value; // 警告: immutability
  doSomething(value);
}, [value]);

// ✅ 标注 + 注释说明
useEffect(() => {
  if (lastProcessedRef.current === value) return;
  // eslint-disable-next-line react-hooks/immutability -- ref 在 effect 内"读-改-写"是合法的命令式去重模式
  lastProcessedRef.current = value;
  doSomething(value);
}, [value]);
```

#### 4.4 mounted state 模式 → 用 typeof window 替代
```typescript
// ❌ 旧模式 (effect 内 setState)
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
const isClient = mounted;

// ✅ 新模式 (无 setState)
const isClient = typeof window !== 'undefined';
```

### 5. Fetch 竞态防护 + 强制 apiFetch

#### 5.1 必须用 `apiFetch` / `apiFetchVoid` (来自 `@/lib/api-client`)
```typescript
// ✅ 正确
import { apiFetch, apiFetchVoid, ApiError } from '@/lib/api-client';

// GET
const data = await apiFetch<{ sessions: Session[] }>('/api/sessions');

// POST
const result = await apiFetch<{ id: string }>('/api/messages', {
  method: 'POST',
  body: { content: 'hello' },
});

// DELETE (无返回值)
await apiFetchVoid(`/api/messages/${id}`, { method: 'DELETE' });

// 处理特定 HTTP 状态码
try {
  await apiFetchVoid('/api/buddy/state', { method: 'PUT', body: state });
} catch (err) {
  if (err instanceof ApiError && err.status === 409) {
    // 处理冲突
  }
}
```

#### 5.2 例外: 可以直接用 `fetch`
- **SSE 流式**: 需要 `reader.read()` 循环 (apiFetch 不支持)
- **FormData 文件上传**: apiFetch 会 JSON.stringify FormData
- **keepalive 请求** (beforeunload): apiFetchVoid 支持, 但部分场景需更精细控制
- **Supabase auth SDK 内部**: 已有自己的 client
- **XState machine services 内部**: actor logic 不应跨边界

#### 5.3 并发请求用 `Promise.allSettled` 而非 `Promise.all`
```typescript
// ❌ 错误 (一个失败全部失败)
const [a, b, c] = await Promise.all([
  fetch('/api/a'),
  fetch('/api/b'),
  fetch('/api/c'),
]);

// ✅ 正确 (单个失败不阻塞其他)
const [aResult, bResult, cResult] = await Promise.allSettled([
  apiFetch('/api/a'),
  apiFetch('/api/b'),
  apiFetch('/api/c'),
]);
const a = aResult.status === 'fulfilled' ? aResult.value : null;
```

#### 5.4 useEffect 内 fetch 必须用 `AbortController`
```typescript
useEffect(() => {
  const controller = new AbortController();
  apiFetch('/api/data', { signal: controller.signal })
    .then(setData)
    .catch(err => { if (err.name !== 'AbortError') console.error(err); });
  return () => controller.abort();
}, [deps]);
```

### 6. 模块级可变状态必须可重置
~~`let` 声明的模块级变量（如 `buddy-sync.ts` 的 `currentUserId`）必须提供 `reset()` 函数~~
> Round 95 注: buddy-sync.ts 已删除, React Query 替代后不再有模块级可变状态。此规则保留用于未来任何模块级 `let`。

### 7. 不新增 `as never` 类型断言
`database.types.ts` 已重新生成（13 表 + 4 RPC + locale 字段），所有 Supabase 查询都有类型。
新代码用正确类型，不用 `as never` 绕过。如果类型不对，说明 `database.types.ts` 需要更新。

### 8. Component owns its form state (2026-07-01 新增)

子组件（弹窗、表单等）应该**自己持有 form state**, 父组件只控制 `open` + `onSubmit`。

```typescript
// ❌ 错误 (父组件持有所有子组件的 form state)
function Parent() {
  const [modalOpen, setModalOpen] = useState(false);
  const [itemName, setItemName] = useState('');
  const [itemAmount, setItemAmount] = useState('');
  return <Modal open={modalOpen} itemName={itemName} setItemName={setItemName} ... />;
}

// ✅ 正确 (子组件 owns form state)
function Parent() {
  const [modalOpen, setModalOpen] = useState(false);
  return <Modal open={modalOpen} onClose={() => setModalOpen(false)} onSubmit={(name, amount) => {...}} />;
}

function Modal({ open, onClose, onSubmit }) {
  const [itemName, setItemName] = useState('');
  const [itemAmount, setItemAmount] = useState('');
  // ...
}
```

**优势**:
- 父组件代码减少
- 子组件可独立测试
- form state 不污染父组件
- 多个 Modal 实例互不干扰

### 9. next.config.ts 不允许 `ignoreBuildErrors: true`
TS 错误必须修复, 不能用 `ignoreBuildErrors: true` 绕过。
当前已关闭 (2026-07-01), 不允许重新开启。

### 10. 必须使用共享 helper (Round 40-78 提取, 2026-07-06 v4 新增 3 个)

以下 helper 已提取, **新增代码必须使用**, 不允许重新内联:

| Helper | 文件 | 用途 | 替代了 |
|--------|------|------|--------|
| `getErrorMessage` | `@/lib/error-utils` | 从 unknown 提取错误消息 | `err instanceof Error ? err.message : String(err)` (90处) |
| `withAuth` | `@/lib/with-auth` | API route auth + cookie + error HOF | 手动 createAuthenticatedClient + 401 check + try/catch (9处) |
| `parseBody` | `@/lib/parse-body` | 安全 JSON body 解析 | `await request.json().catch(() => ({}))` (18处) |
| `timingSafeCompare` | `@/lib/timing-safe-compare` | SHA-256 hash-then-compare | 手动 timingSafeEqual (4处) |
| `getChallengeType` | `@/lib/challenge-rules` | amount → challenge type | `amount > 200 ? 'boss' : ...` (8处) |
| `sanitizeImapError` | `@/lib/email/sanitize-error` | IMAP 错误脱敏 | 手动 regex replace (2处) |
| `raceWithTimeoutFallback/Reject` | `@/lib/race-timeout` | Promise.race + timeout | 手动 Promise.race + setTimeout (8处) |
| `useTimeout` | `@/hooks/use-timeout` | 声明式 setTimeout + 自动 cleanup | 手动 useRef + useEffect cleanup (30+处) |
| `usePrevious` | `@/hooks/use-previous` | 跟踪前值 | 手动 useRef + useEffect (10+处) |
| **`toJson`** ⭐ | `@/lib/json-helpers` | typed → Supabase Json (写入 DB) | `value as unknown as Json` (15+处) |
| **`parseJsonField/parseJsonArray/parseJsonObject`** ⭐ | `@/lib/json-helpers` | Json → typed T (读 DB), 可选运行时验证 | `value as unknown as SomeType[]` (无验证, 数据库坏数据直接 crash) |
| **`extractReasoning/extractToolCall/extractToolReturn`** ⭐ | `@/lib/letta-message-helpers` | Letta SDK 消息字段提取 | `msg as unknown as Record<string, unknown>` (5+处, **修复 tool_return 静默丢失 bug**) |
| **`callZAIChatCompletion/callZAIChatCompletionStream`** ⭐ | `@/lib/zai-sdk-types` | ZAI SDK typed 调用 wrapper | `(zai.chat.completions.create as any)({...})` (3处, SDK 返回 any 无类型检查) |

#### ⭐ Round 78 新增 helper 用法示例

```typescript
// ✅ toJson — 写入 DB
.insert({ metadata: toJson(input.metadata) })           // 替代 (input.metadata || {}) as unknown as Json
.update({ badges: toJson(allBadges) })                  // 替代 allBadges as unknown as Json

// ✅ parseJsonArray — 读 DB (自动验证是数组)
const chapters = parseJsonArray<StoryChapter>(row.chapters, []);  // 替代 row.chapters as unknown as StoryChapter[] ?? []
const badges = parseJsonArray<string>(result.badges, []);          // 替代 result.badges as unknown as string[]

// ✅ parseJsonField with validate — 读 DB (运行时验证)
const list = parseJsonField<Badge[]>(row.badges, [],
  (v): v is Badge[] => Array.isArray(v) && v.every(isBadge));

// ✅ extractReasoning — Letta 消息
if (msg.message_type === 'reasoning_message') {
  reasoning = extractReasoning(msg);  // 替代 (msg as unknown as Record).reasoning || ...
}

// ✅ extractToolCall — Letta 工具调用
const call = extractToolCall(msg);  // 替代 msgAny.tool_call + JSON.parse + tool_call_id 提取
if (call) { toolCalls.push({ name: call.name, toolCallId: call.toolCallId, args: call.args }); }

// ✅ extractToolReturn — Letta 工具返回 (修复了 tool_return 静默丢失 bug!)
const ret = extractToolReturn(msg);  // 用 SDK 顶层字段 (name/tool_call_id/tool_return)
if (ret) { /* ret.name, ret.toolCallId, ret.content */ }

// ✅ callZAIChatCompletion — ZAI SDK typed 调用
const completion = await callZAIChatCompletion(messages, { temperature: 0.7 });
const text = completion.choices[0]?.message?.content ?? '';  // 完全类型安全
```

### 11. 新增 API route 必须用 `withAuth` HOF (2026-07-06 新增)

```typescript
// ✅ 正确 — withAuth 自动处理 auth + cookie merge + error
export const GET = withAuth(async ({ supabase, user, request }) => {
  const data = await supabase.from('...').select('*').eq('user_id', user.id);
  return NextResponse.json({ data });
});

// ❌ 错误 — 手动 auth + cookie + try/catch (15行样板)
export async function GET(request: NextRequest) {
  const { supabase, user, error, mergeCookies } = await createAuthenticatedClient(request);
  if (error || !user || !supabase) return mergeCookies(NextResponse.json({ error: 'Not authenticated' }, { status: 401 }));
  try {
    const data = await supabase.from('...').select('*').eq('user_id', user.id);
    return mergeCookies(NextResponse.json({ data }));
  } catch (err) {
    logger.error('Failed:', err);
    return mergeCookies(NextResponse.json({ error: 'Internal server error' }, { status: 500 }));
  }
}
```

### 12. 新增纯函数必须有单元测试 (2026-07-06 新增)

- 纯函数 (无 DB/API/side effects) 必须有 vitest 测试
- 测试文件放在 `src/**/__tests__/*.test.ts`
- 运行 `npx vitest run` 验证
- CI workflow 会自动运行测试, 失败阻止 merge

### 13. database.types.ts 必须用脚本生成 (2026-07-06 新增)

```bash
# 重新生成 (需要 Supabase secret key)
SUPABASE_URL=https://fcgpxrujhnqramggupjm.supabase.co \
SUPABASE_SECRET_KEY=sb_secret_xxx \
python3 scripts/gen-types-from-api.py
```

- 不允许手动编辑 `src/lib/database.types.ts`
- 新增 migration 后必须重新生成
- 脚本包含 ENUM_OVERRIDES / VECTOR_OVERRIDES / TRIGGER_CALCULATED_FIELDS / RPC_RETURNS_OVERRIDES

### 14. 文件行数硬限制 ≤800 行 (2026-07-06 修订)

所有 .ts/.tsx 文件 ≤800 行。当前 7/7 大文件已达标:

| 文件 | 行数 | 拆分方法 |
|------|------|----------|
| chat-tab.tsx | 865 | 提取 use-chat-actions + use-chat-persistence + demo-reply |
| use-butterfly-normal-player.ts | 679 | 提取 use-player-actions |
| machine-services.ts | 639 | 提取 machine-guards + service-inputs + illustration-actors + preload-actors + sse-event-mapper |
| illustration-engine.ts | 603 | 提取 illustration-helpers |
| monitor-tab.tsx | 485 | 已达标 |
| use-chat-actions.ts | 777 | 提取 consume-ai-stream + retry-ai-response |
| use-player-actions.ts | 783 | 提取 advance-chapter + select-choice |

---

## 🟡 软规则 (强烈建议)

### 10. React 组件职责单一
一个组件/hook 只做一件事。如果超过 3 个职责，拆分。
"上帝组件"（如原 chat-tab.tsx 1517 行）是 bug 温床。

### 11. 提取 custom hook 的时机
- 同一 state + effect 组合在 2+ 组件中重复 → 提取
- 组件超过 500 行 → 考虑提取
- useEffect 超过 30 行 → 考虑提取

### 12. 用已有库，不造轮子
| 场景 | 用库 | 不手写 |
|------|------|--------|
| 日期格式化 | date-fns (已装) | toLocaleDateString |
| className 合并 | cn() = clsx + tailwind-merge (已装) | 字符串拼接 |
| 状态机 | XState v5 (已装) | 手写 phase + useEffect |
| 虚拟列表 | react-virtuoso (已装) | 手写分页 |
| IndexedDB | Dexie 已移除 (Round 95 React Query 替代) | 原生 IndexedDB API |
| API 调用 | apiFetch / apiFetchVoid | 内联 fetch |
| SSE 解析 | fetch + reader.read() | EventSource (不支持 POST) |

### 13. API 路由必须有 try/catch
所有 `export async function GET/POST/DELETE` 必须有外层 `try/catch`，返回 `{ error: 'Internal server error' }` 而非泄露错误信息。

### 14. Supabase 查询用 `.maybeSingle()` 而非 `.single()`
`.single()` 无结果时抛 `PGRST116` error，`.maybeSingle()` 返回 null。
只有在确定"一定有结果"时（如刚 INSERT 后查询）才用 `.single()`。

### 15. 子组件目录结构 (2026-07-01 新增)
拆分出的子组件放在 `<parent>/` 子目录, 不散落在 `components/` 根:
```
components/
  buddy-tab.tsx              (父组件)
  buddy/                     (子组件目录)
    challenge-modal.tsx
    dream-fund-editor.tsx
  chat-tab.tsx               (父组件)
  chat/                      (子组件目录)
    hooks/
      use-chat-messages.ts
      use-challenge-mode.ts
      ...
```

---

## 📋 架构债清单 (2026-08-04 Round 3 更新)

> ✅ **当前超限文件 = 0 个** — 所有非测试文件均 ≤800 行。
> buddy-sync.ts / use-buddy-state.ts 已删除 (React Query 替代)。
> 10 个 dead code 文件已删除 (2,225 行), 守卫测试防止复活。

### 接近上限的文件 (监控, 尚未超限)

| 文件 | 行数 | 上限 | 类型 |
|------|------|------|------|
| buddy-tab.tsx | 795 | 800 | .tsx 组件 |
| use-player-actions.ts | 790 | 800 | .ts hook |
| page.tsx | 786 | 800 | .tsx 页面 |
| use-chat-actions.ts | 781 | 800 | .ts hook |
| chat-tab.tsx | 740 | 800 | .tsx 组件 |
| butterfly-machine.ts | 624 | 800 | .ts machine |
| letta-agent-manager.ts | 640 | 800 | .ts lib |

### test-only dead code (P1, 待 architect 评估)

| 文件 | 行数 | 备注 |
|------|------|------|
| lib/intent-detection.ts | 478 | 仅被自身 test 引用, 生产代码已不调用 |
| lib/llm-client.ts | 330 | 仅被自身 test 引用, 已被 zai-sdk-types.ts 替代 |
| lib/mcp-letta-tools.ts | 344 | 仅被 test/setup.ts 注释提及, 已迁移到 mcp-tools/handlers/ |

**小计 ~1,152 行**, 需 architect 评估删除 vs 迁移价值。

---

## ✅ 已完成的架构优化 (2026-06-30 ~ 2026-07-01)

1. ✅ chat-tab.tsx 1517 → 999 → 1426 行 (中间拆分 4 hooks, 后续 N62/N73 fix 增长)
2. ✅ database.types.ts 重新生成 (13 表 + 4 RPC + locale 字段)
3. ✅ Buddy 同步从 polling 迁移到 Supabase Realtime
4. ✅ i18n Provider SSR-safe (移除 if(!mounted) return null, lazy initializer)
5. ✅ useBuddyState 本地写入 action 移除
6. ✅ API 错误处理 + .single() → .maybeSingle() 修正
7. ✅ 仓库根目录 64 个垃圾文件清理 + .gitignore 强化
8. ✅ CI smoke test + database types check workflows
9. ✅ buddy-sync resetSyncState 跨用户数据污染修复
10. ✅ loadHomeData/loadEmailData AbortController 竞态防护
11. ✅ 统一 API client (lib/api-client.ts): apiFetch + apiFetchVoid + ApiError
12. ✅ 内联 fetch → apiFetch 收编 12 处 (page.tsx 4 + chat-tab 5 + profile-tab 1 + buddy-sync 3)
13. ✅ 架构债管理规范 (.memory/architecture-debt-policy.md) v1 + v2
14. ✅ TS 错误清零 (2026-07-01): 70 → 19 → 8 → 0
    - use-butterfly-normal-player.ts: 提取 local variable + 独立函数绕过 TS 跨 await narrowing
    - machine-actions.ts: typedAssign/typedAssignObject wrappers 解决 XState v5 TEvent 推断
15. ✅ next.config.ts 关闭 ignoreBuildErrors: true (TS 已 0 错误)
16. ✅ ESLint 规则开启 + `_` 前缀变量忽略
17. ✅ React 19 Compiler 兼容性修复 (26 errors → 0):
    - auth/login & signup: useRef + render-中-赋值 → useMemo
    - use-butterfly-normal-player: ref 在 effect 内"读-改-写"标注
    - i18n provider: lazy initializer 替代 effect 内 setLocaleState
    - onboarding-guide: isAnimating 派生自 visible
    - profile-tab & butterfly-tab: typeof window 替代 mounted state
    - use-butterfly-demo-player: useMemo 内读 ref → 读 state
18. ✅ buddy-tab.tsx 拆分 (1107 → 919 行):
    - ChallengeModal 提取到 buddy/challenge-modal.tsx (owns form state)
    - DreamFundEditor 提取到 buddy/dream-fund-editor.tsx (owns form state)
19. ✅ use-butterfly-normal-player.ts: shouldCompleteAfterSubmit/computeCompleteValues 提取到 player/helpers.ts
20. ✅ scripts/ + doc/PPT_make/ 关闭 no-require-imports (Node.js 脚本用 CommonJS 是合理的)
21. ✅ public/ 加入 ESLint ignores (静态资源不需 lint)
22. ✅ database.types.ts 自动生成 (Round 44, scripts/gen-types-from-api.py)
    - 20 表 + 12 RPC, ENUM/VECTOR/TRIGGER/RPC_RETURNS overrides
    - as never casts 从 40 → 0
23. ✅ 7 共享 helper 提取 (Round 51-56):
    - error-utils.ts: getErrorMessage (90处 → 1行)
    - with-auth.ts: withAuth HOF (9处 auth+cookie 样板 → 3行)
    - parse-body.ts: parseBody (18处 → 1行)
    - timing-safe-compare.ts: SHA-256 hash-then-compare (4处 → 1处)
    - challenge-rules.ts: getChallengeType (8处 → 1处)
    - email/sanitize-error.ts: sanitizeImapError (2处 → 1处)
    - race-timeout.ts: raceWithTimeoutFallback/Reject (8处 → 1处)
24. ✅ 2 React hooks 提取 (Round 54):
    - use-timeout.ts: 声明式 setTimeout + 自动 cleanup (30+处 → 1行)
    - use-previous.ts: 跟踪前值 (10+处 → 1行)
25. ✅ ESLint warnings 清零 (Round 68/71): 155 → 0
    - 降级 React 19 Compiler 规则 error → warn
    - 开启零成本安全规则: no-unreachable, no-fallthrough, no-empty, prefer-as-const
26. ✅ 测试基础设施 (Round 58-76): 0 → 853 tests
    - vitest + @vitest/coverage-v8 + @testing-library/react + happy-dom
    - 26 test files 覆盖全部纯函数
27. ✅ CI workflow (Round 76): .github/workflows/ci-checks.yml
    - 3 jobs: typecheck + lint (--max-warnings=0) + test
28. ✅ Pre-commit hook (Round 76): scripts/setup-precommit.sh
29. ✅ God component 拆分 (Round 60-70): 7/7 达标
    - chat-tab.tsx: 1780 → 865 (提取 use-chat-actions + use-chat-persistence + demo-reply)
    - use-butterfly-normal-player.ts: 1652 → 679 (提取 use-player-actions)
    - machine-services.ts: 1321 → 639 (提取 5 个模块)
    - illustration-engine.ts: 878 → 603 (提取 illustration-helpers)
    - use-chat-actions.ts: 1080 → 777 (提取 consume-ai-stream + retry-ai-response)
    - use-player-actions.ts: 1194 → 783 (提取 advance-chapter + select-choice)
30. ✅ 112+ 架构 bug 修复 (Round 40-76):
    - 3 CRITICAL: 跨用户消息泄露 + orphan agent 月费泄漏 + 401 静默吞错
    - 8 HIGH: letta backoff + IMAP 凭证泄漏 + Promise.race rejection + PII leakage + ...
    - 30+ MEDIUM: JSON.stringify 双重 encode + NaN guard + Max-Age=0 cookie + ...
    - 70+ LOW: untracked timers + silent catch + stale comments + ...
31. ✅ Round 78 — SDK 类型安全 + JSONB 类型安全 + 2 bug 修复 (2026-07-06):
    - 3 新共享 helper (10 个总计):
      a. `json-helpers.ts` (toJson + parseJsonField + parseJsonArray + parseJsonObject)
         替代 15+ 处 `as unknown as Json` + 5+ 处 `as unknown as SomeType[]`
      b. `letta-message-helpers.ts` (extractReasoning/ToolCall/ToolReturn + 流式 variants)
         替代 5+ 处 `as unknown as Record<string, unknown>` 访问 SDK 字段
      c. `zai-sdk-types.ts` (callZAIChatCompletion + callZAIChatCompletionStream + typed interfaces)
         替代 3 处 `(zai.chat.completions.create as any)({...})`
    - 2 HIGH bug 修复:
      a. **Letta tool_return 静默丢失**: 旧代码访问 `msg.tool_call` (嵌套) 但 SDK ToolReturnMessage
         顶层字段是 `name/tool_call_id/tool_return`, 没有 `tool_call` → toolCall 永远 undefined
         → toolName 永远 '' → 整个 tool_return_message 分支是死代码 → 用户看不到工具执行结果
         修复: extractToolReturn 用正确顶层字段 + 防御性 fallback
      b. **ImapFlow header 数组形式 bug**: 旧代码 `header: ['Subject', 'order']` (数组)
         ImapFlow search compiler 用 Object.keys 遍历, 数组被当 `{0:'Subject', 1:'order'}`
         → 搜索 header "0" 值 "Subject" (永远不匹配) → 5 个关键词搜索全是死代码
         → 系统总是 fallback 到全量日期扫描 (性能差 + 隐私风险)
         修复: 用对象形式 `header: { Subject: 'order' }` (ImapFlow 类型要求)
    - 移除 `false as unknown as undefined` cast (ImapFlow logger 类型已接受 false)
    - 移除 `stream as unknown as { controller: AbortController }` cast (SDK Stream 类已公开 controller)
    - 移除 `(agent as unknown as Record<string, unknown>)?.id` cast (SDK AgentState.id 是必填)
    - 125 新 tests (853 → 978, +14.7%):
      json-helpers.test.ts: 47 tests (toJson + parseJsonField + parseJsonArray + parseJsonObject + integration)
      letta-message-helpers.test.ts: 56 tests (extractReasoning/ToolCall/ToolReturn + 流式 variants + regression)
      zai-sdk-types.test.ts: 22 tests (type definitions + call patterns + error propagation + integration)
    - 重构 7 文件使用 json-helpers (health-impact, cultivation, embed-backfill, mcp-tools/_shared,
      illustration-engine, db-mappers, butterfly/story/route)
    - 重构 letta.ts 使用 letta-message-helpers (5 处 cast → 1 行 helper 调用)
    - 重构 llm-client.ts 使用 zai-sdk-types (3 处 `as any` → 1 行 typed wrapper 调用)

---

## ⚠️ 需后续处理的剩余架构债

### 1. ESLint warnings — ✅ 已清零 (Round 68/71)
- 从 155 → 0 warnings
- React 19 Compiler 警告通过 eslint-disable + reason 注释处理
- CI: `npx eslint src/ --max-warnings=0` 阻止回归

### 2. 剩余内联 fetch (~15 处, 全部合理保留)
- consume-ai-stream.ts: SSE 流式 (apiFetch 不支持 reader.read)
- auth-provider: Supabase auth SDK 内部
- i18n-provider: /api/user/locale fire-and-forget
- machine-services actors: XState actor 内部 fetch
- 监控路由: AbortController + Promise.all

### 3. 大文件 — ✅ 全部达标 (Round 60-70)
- 7/7 文件 ≤800 行 (见硬规则 §14)
- 拆分方法: 提取纯函数到独立文件 + 提取 hook 到独立文件 + re-export 保持向后兼容

### 4. 测试覆盖 — ✅ 853 tests (Round 58-76)
- 纯函数: 853 tests 覆盖 error-utils, challenge-rules, timing-safe-compare, parse-body,
  sanitize-error, race-timeout, with-auth, use-timeout, use-previous, buddy-defaults,
  descriptions, impulse-score, receipt-parser, distributed-lock, health-impact, cultivation,
  embeddings, ai-audit, mcp-tools, _shared, engine-helpers, sse-event-mapper, preload-logic,
  helpers, utils, supabase-admin
- CI: vitest 自动运行, 失败阻止 merge

### 5. CI 基础设施 — ✅ 已建立 (Round 76)
- `.github/workflows/ci-checks.yml`: typecheck + lint + test (3 jobs)
- `scripts/setup-precommit.sh`: pre-commit hook (tsc + ESLint)

---

## 🔧 架构债管理流程

1. **新增代码前**：读本文件，确认不违反硬规则
2. **PR 自查**：
   - 检查文件行数
   - 检查 hooks 顺序
   - 检查 fetch 是否用 apiFetch
   - 检查 React 19 Compiler 兼容性 (无 refs in render, 无 effect 内 setState)
   - 检查子组件 form state 归属
3. **每月 review**：检查架构债清单，评估是否需要专项重构
4. **重构时**：渐进式拆分，每步 build + 冒烟测试，保持行为零变化

---

## 🚫 禁止事项 (Never Do)

1. ❌ 生成 `.docx` 文件 (用户明确要求)
2. ❌ 重新开启 `next.config.ts` 的 `ignoreBuildErrors: true`
3. ❌ 用 `as never` 绕过 Supabase 类型 (用 `database.types.ts` 正确类型, 脚本生成)
4. ❌ 在 render 中读/写 ref (用 useMemo 或 state)
5. ❌ 在 effect 内同步 setState (用 lazy initializer / useMemo / eslint-disable 标注)
6. ❌ 父组件持有子组件的 form state (子组件 owns its form state)
7. ❌ 新文件超过 800 行 (.tsx) / 500 行 (.ts hook) / 400 行 (API route)
8. ❌ 在仓库根目录放非白名单文件
9. ❌ 用 `mounted` state + `useEffect(() => setMounted(true), [])` (用 `typeof window !== 'undefined'`)
10. ❌ 用 `Promise.all` 发并发请求 (用 `Promise.allSettled` 让单个失败不阻塞其他)
11. ❌ 手动编辑 `database.types.ts` (用 `scripts/gen-types-from-api.py` 生成)
12. ❌ 重新内联已提取的 helper (getErrorMessage, withAuth, parseBody, timingSafeCompare, 等 — 见硬规则 §10)
13. ❌ 新增 API route 不用 `withAuth` HOF (见硬规则 §11)
14. ❌ 新增纯函数不写单元测试 (见硬规则 §12)
15. ❌ 用 `JSON.stringify` 传 JSONB RPC 参数 (supabase.rpc 已做 JSON.stringify, 双重 encode)
16. ❌ 用 `as unknown as Record<string, unknown>` 绕过缺失的接口字段 (修复接口定义, 不绕过)
17. ❌ `catch {}` 静默吞错 (至少加 `logger.warn` 或 `eslint-disable` + reason)
18. ❌ `if (options.maxAge)` 检查 maxAge (用 `!== undefined`, maxAge=0 是有效的 cookie 删除)
19. ❌ 用 `value as unknown as Json` 写 Supabase JSONB (用 `toJson(value)` — 见硬规则 §10, Round 78)
20. ❌ 用 `value as unknown as SomeType[]` 读 Supabase JSONB 数组 (用 `parseJsonArray<T>(value, [])` — 自动验证是数组)
21. ❌ 用 `(zai.chat.completions.create as any)({...})` 调 ZAI SDK (用 `callZAIChatCompletion` typed wrapper — 见硬规则 §10)
22. ❌ 直接访问 Letta SDK `msg.tool_call` on ToolReturnMessage (用 `extractToolReturn(msg)` — 顶层字段是 `name/tool_call_id/tool_return`, **不是嵌套 tool_call**)
23. ❌ ImapFlow `header: ['Subject', 'value']` 数组形式 (用 `header: { Subject: 'value' }` 对象形式 — 数组被当 `{0:..., 1:...}`, 永远不匹配)
24. ❌ 用 `false as unknown as undefined` 绕过 ImapFlow logger 类型 (类型已接受 `false`, 无需 cast)
