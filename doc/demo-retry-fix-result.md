# demo/guest 模式重试按钮打错端点 — P0 修复结果

- 基线：`main` @ `254ac95`
- 范围：仅前端端点选择 + 回归测试；**未**触碰 `/api/chat`、`/api/chat/anonymous` 的 route 逻辑；**零** i18n 改动
- 结论：已修复，测试/tsc/eslint 全绿

---

## 1. 根因（coordinator 已锁定，未重新诊断）

guest（demo）模式下 `retryAiResponseImpl` 的 `fetch` 硬编码登录端点：

```
src/components/chat/hooks/retry-ai-response.ts:153   const response = await fetch('/api/chat', …)
```

首条消息走 `parts/send-message-request.ts:55`（`isDemo ? "/api/chat/anonymous" : "/api/chat"`）正常；
回复失败后点「重试」→ guest 无 session → `route.ts` `userAgentId` 为空 → 503
「AI is still initializing」→ `catch` 块渲染 `chat.aiFallback.aiError`（「Symy 现在很安静」）
→ 再点重试仍然打 `/api/chat` → 永远 503 = demo 体验死循环。

---

## 2. 修复方案

端点选择下沉为单一真源，两条请求路径（`sendMessage` / `retryAiResponse`）共用，杜绝再次漂移。

### 2.1 新增 `src/components/chat/hooks/parts/chat-endpoint.ts`

```ts
export function resolveChatEndpoint(isDemo: boolean): "/api/chat/anonymous" | "/api/chat" {
  return isDemo ? "/api/chat/anonymous" : "/api/chat";
}
```

返回类型用字面量联合（而非 `string`），使端点漂移在类型层即可暴露。

### 2.2 `src/components/chat/hooks/parts/send-message-request.ts`（主路径行为零变化）

- 新增 import；`const chatEndpoint = isDemo ? … ` 改为 `resolveChatEndpoint(isDemo)`。
- 其余（`apiMessages` 组装、body 全字段、`credentials: "include"`、`signal`、非 200 抛 `ApiError`）**byte-for-byte 未动**。

### 2.3 `src/components/chat/hooks/retry-ai-response.ts`（核心修复）

- `RetryAiResponseParams` 新增 `isDemo: boolean`。
- `fetch('/api/chat', …)` → `fetch(resolveChatEndpoint(isDemo), …)`；**body 字段全部保持既有**（`messages` / `impulseContext` / `challengeContext` / `stream` / `locale` / `greenPref` / `guardIntensity` / `guardScope` / `signal` / `credentials`），不做 body 结构统一——retry 路径的 `apiMessages` 语义（排除 assistant 占位与 `isError` 气泡）与 sendMessage 不同，强行共用会引入新 bug。
- 文件头「关键不变量」新增端点不变量条目。

### 2.4 `src/components/chat/hooks/use-chat-actions.ts`（调用方接线）

- `retryAiResponse` 的 `useCallback` 注入 `isDemo`（`state.isDemo` 已在 hook 顶部解构，与 `sendMessage` 同一数据源）。
- `useCallback` deps 增加 `isDemo`（`isDemo` 在 demo↔登录切换时变化，必须进 deps；`retryAiResponseRef` 每次 render 同步赋值，onRetry 闭包仍能拿到最新值）。
- `sendMessage` 主路径与其 deps **未改**。

---

## 3. 匿名额度取舍（有意为之，已落代码注释）

- 每次重试打 `anonymous` 端点会**再消耗 1 次 daily 额度**（3/天）。
- 若原始失败是流中断（服务端已计数），重试即**第二次消耗**。
- 判定：可接受，不做额度退款/补偿复杂化。理由：
  1. 与登录用户既有语义一致——「重试 = 再请求一次」，重试是用户显式动作；
  2. 「失败即退还」需要跨请求幂等 + 请求指纹去重，成本高、收益低、易引入新 bug；
  3. 额度耗尽时服务端返回额度错误 → 走既有 `catch` → `aiError` 文案，行为与登录态一致，无需新文案（故 i18n 零改）。
- 该取舍已写入 `retry-ai-response.ts` 端点选择处的 `⚠️ 匿名额度取舍` 注释块。

---

## 4. diff 摘要

```
 src/components/chat/hooks/parts/chat-endpoint.ts          | 20 +++++++++ (新增)
 src/components/chat/hooks/parts/send-message-request.ts   |  4 +-
 src/components/chat/hooks/retry-ai-response.ts            | 25 ++++++--
 src/components/chat/hooks/use-chat-actions.ts             |  3 ++
 src/components/chat/hooks/__tests__/retry-ai-response.test.ts       | 54 +++++++++++++
 src/components/chat/hooks/__tests__/use-chat-actions.test.tsx      | 47 +++++++++++
 5 files changed, 129 insertions(+), 4 deletions(-)   （+ 1 新文件 20 行）
```

## 5. 测试

新增 4 例（mock `fetch` 断言端点，follow 现有 `vi.stubGlobal('fetch', …)` 同款）：

`__tests__/retry-ai-response.test.ts`（harness 补 `isDemo: false` 默认值）
1. `isDemo=true` → `fetch` 首参 `/api/chat/anonymous`，且 body 与登录态同构（`messages` / `stream` / `greenPref` / `guardIntensity`）
2. `isDemo=false` → `/api/chat`（不回归）
3. guest 503 → `isError` + `onRetry`；**再点重试仍打 anonymous**（死循环守卫），user 消息不复制、锁释放

`__tests__/use-chat-actions.test.tsx`（放在 real-timers describe，规避该文件 demo describe 的 fake timers）
4. 端到端：`isDemo=true` + `activeChallenge` → 首条真实 API 打 `anonymous` 得 503 → 点 `onRetry` → 第二次请求仍为 `anonymous`，body 恰 1 条 user 上下文，UI 恰 1 user + 1 assistant，锁释放

**回归守卫有效性验证**：把实现临时回退为 `const chatEndpoint = '/api/chat'`（修复前状态）后重跑，新增 3 例 demo 相关用例**全部变红**（2 failed files / 3 failed tests），恢复后全绿 —— 证明断言真能捕获该 bug，而非恒真。

### 计数

| 命令 | 结果 |
| --- | --- |
| `npx vitest run src/components/chat/hooks/` | **18 files / 157 tests passed**（修改前 154，净增 3：新文件 +4 −1 处 harness 变更不增用例） |
| `npx vitest run src/components/chat src/app/api/chat` | **136 files / 1264 tests passed** |
| `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` | **0 error** |
| `npx eslint <6 个改动文件>` | **0 warning / 0 error** |

> `npx tsc --noEmit` 默认堆在本机 9GB 内存下 OOM（`Ineffective mark-compacts near heap limit`），需 `NODE_OPTIONS=--max-old-space-size=8192`；与本次改动无关。

---

## 6. 红线核对

- [x] `/api/chat`、`/api/chat/anonymous` 的 route 逻辑未动（仅跑其既有测试做旁证）
- [x] `send-message-request.ts` 主路径未动（仅端点三元换为等价 helper 调用）
- [x] i18n 零改（`chat.aiFallback.*` 文案已存在，guest 重试复用同一路径）
- [x] 未执行 git fetch / rebase / checkout / push
