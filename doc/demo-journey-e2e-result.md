# 访客 (guest/demo) 首体验端到端 — QA 核对结果

- 基线：`main` @ `581aeef`（batch124-a demo retry 端点修复已落地）
- 范围：**纯测试**（新增 1 文件 / 7 例）+ 本文档；**零**生产代码改动、**零** i18n 改动
- 结论：访客链路 4 个场景全部在 hook 层跑通并锁定现状；**新发现 3 个断点**（B-1 / B-2 / B-4）需真浏览器复核
- 验证：`vitest src/components/chat/` **582 例绿（72 文件）**；`tsc --noEmit` **0**；`eslint 新文件` **0**；`architecture-guards` **137 例绿**

---

## 1. 本批做了什么

`src/components/chat/hooks/__tests__/guest-journey.test.tsx`（7 例，纯新增）——把访客从「进站 → 发消息 → 连续对话 → 挑战首条 → 额度耗尽」整条链路在 hook 层端到端跑一遍，**断言当前真实行为**。

harness 沿用 `use-chat-actions.test.tsx` 同款注入形状（chat-tab 对 `useChatActions` 的逐项 props 注入，无 provider 依赖），本文件专属差异只有 3 点：

1. `isDemo=true` 为默认状态、**默认无** `activeChallenge`（访客视角）
2. 连发/dedup 走访客真实路径（canned timer，`vi.useFakeTimers`），不用真 AI 流 mock
3. 429 走**完整端到端链路**：`sendMessage` → 气泡 `onRetry` → `retryAiResponse`（而非只 mock 一次 fetch）

> 用例注释里的 ⚠️ = 断点/需真机复核，绿 = 该断点已过。**本文档即是 QA 站的逐条核对清单。**

---

## 2. 场景结论（4 场景）

| 场景 | 结论 | 关键事实（已锁死） |
|---|---|---|
| **A** 首条普通消息 | ⚠️ **B-1** | 访客普通消息**零真实 AI 请求**（canned 路径）；1.5s 后恰 1 条 canned 回复；`demoMsgCount=1`；满 3 条排注册引导 timer |
| **B** 连发 | ⚠️ **B-4** | 不同文案在 1.5s 窗口内连发 → 锁放行（BUG-25 不回归）但**第 1 条 canned 回复被清掉**；1s dedup 窗口内同文案被静默吞 |
| **C** 挑战首条 | ✅ | `challengeContext` 上行 + 端点 `anonymous` + `mode='challenge'` + 2 条落库；batch124-a 端点修复不回归 |
| **D** 额度耗尽 (429) | ⚠️ **B-2** | sendMessage 与 retry **两侧** 429 都落 `isError` 气泡 + `onRetry`；retry 端点仍 `anonymous`；**零注册引导** |

---

## 3. 新发现断点（需真浏览器站复核 + 决策）

### B-1 ⚠️ 访客首条普通消息拿不到真 AI（首体验核心价值缺口）

- 位置：`use-chat-actions.ts:227-255`
- 事实：`isDemo` 分支只把 **`isFirstChallenge`**（`demoMsgCountRef===0 && activeChallengeRef.current`）放行到真实 API；其余全部进 `handleDemoSendMessage`（canned）。
- 用户路径：新访客无 `activeChallenge`（该字段来自 challenge 弹层）→ 首条普通消息 = canned。
- 影响：访客在「没有先点挑战弹层」时全程 canned，拿不到匿名端点已经具备的真 AI 能力（`/api/chat/anonymous` 对普通消息完全支持，`challengeContext` 可选）。
- 待决策（**未改代码**）：是否让访客首条普通消息也放行真实 AI（`demoMsgCount` 语义随之需重定义）。属于产品策略，须 coordinator / PM 拍板，不在本批范围内。

### B-2 ⚠️ 匿名 3 条/天额度耗尽 → 零注册引导

- 位置：`retry-ai-response.ts:189-194` 的 `!response.ok` 分支（`send-message-error.ts:44` 同款）。
- 事实：429 无特判（仅 401 特判 `authRequired`）→ 落 `chat.aiFallback.aiError`「Symy 现在很安静」；route 返回的 `signUpUrl` 未被任何代码读取；`onAuthPrompt` / `onToast` 零调用。
- 影响：访客把 3 条/天用完后，界面是「安静了」+ 一个注定再失败的**重试按钮**，没有任何注册入口 —— 转化漏斗在此处断裂。
- 待决策：新增 429 文案 + 注册引导（i18n 需双语对称新增），或复用 `onAuthPrompt`。**i18n 改动不在本批范围**。

### B-4 ⚠️ 1.5s 窗口内连发 → 前一条用户消息永远等不到回复（无错误、无重试入口）

- 位置：`demo-send-message.ts:67` — `if (demoReplyTimerRef.current) clearTimeout(demoReplyTimerRef.current);`
- 事实：该 clear 是为 BUG-45「防止多次 auth prompt 叠加」，但同时把**已排队的第 1 条 canned 回复**整条取消。实测：两条不同文案消息在 1.5s 内连发 → 用户消息 2 条、AI 回复 1 条，第 1 条永久沉默（既非 `isError` 气泡，也无 `onRetry` 可点）。
- 附带：`demoMsgCount` 只在 timer 回调里 +1，被清掉的那条**不计数** → 计数与用户实际发送条数脱钩。
- 建议（**未改代码**）：把「清 auth timer」与「清 reply timer」拆开——只清 `demoAuthTimerRef`，`demoReplyTimerRef` 改挂载在消息 id 上（Map 队列），或第 1 条立即落地占位气泡。

### B-3 ⚠️ 访客长会话会撞 route 侧 `max(10)`

- 位置：`/api/chat/anonymous/route.ts:44-52` `anonymousChatSchema`（`z.array(...).min(1).max(10)`）
- 事实：前端每轮 `messages` = 既有消息 + 本轮 user，**零截断**（用例锁死 1 → 3 → 5 增长）。匿名端点每轮 +2，**第 5 轮 9 条 / 第 6 轮 11 条**即撞 `max(10)` 被 zod 400。
- 与 B-1 的关系：B-1 现状（canned）使该断点在访客侧**暂时不可达**；一旦按 B-1 放开真 AI，它立即成为 P1。
- 待决策：访客端也做尾部截断（与登录端对齐），或放宽匿名端点上限。

---

## 4. 已过断点（不回归，QA 站照单核对）

| 项 | 证据（用例） |
|---|---|
| 端点单源：访客 `sendMessage` / `retry` 恒 `/api/chat/anonymous`，登录态恒 `/api/chat` | 场景 C、场景 D（`fetchMock.mock.calls[n][0]`） |
| batch124-a 修复不回归：guest 503/429 后点重试仍打 anonymous | 场景 D 第二段 |
| 重试不复制 user 消息、错误气泡不落库（BUG-116 / NEW-002） | 场景 D（user 恒 1 条；`saveMessage` 无 `isError`） |
| 访客满 3 条 canned → 注册引导 `onAuthPrompt('chat')` | 场景 A 第 2 例 |
| 1s dedup 窗口：同文案连点静默吞掉（零新请求、零新用户消息） | 场景 B 第 2 例 |
| 锁 force-abort 放行：连发不吞用户消息（BUG-25） | 场景 B 第 1 例 |
| 错误重试入口存在：429 / 503 气泡均带 `onRetry` | 场景 A/D |

---

## 5. 明确留给 QA 站真浏览器的（hook 层测不了）

1. **真 AI 慢流中途连发**（B-2 同族）：hook 层 mock `Response` 时 `signal` 只挂在 fetch 上、mock 不实现 abort 语义，无法复现真实 `AbortError` → 需真机测「真实 SSE 流中途发第 2 条」的第 1 条气泡最终态（正文 / 空气泡 / 错误文案）。
2. **`/api/chat/anonymous` 的真实 zod 校验**：B-3 的「第几轮 400」需真机连发确认（本仓 mock 不做 route 侧校验）。
3. **真实 429 消耗**：route 侧 `ANONYMOUS_RATE_LIMIT` 计数是跨请求状态，harness 不模拟；需真机把 3 条/天用完复现 B-2 文案。
4. **访客首屏实际 `isDemo` 判定**：`page.tsx:63` `!hasEverHadUserRef.current && !user && !loading`，需真机确认「同浏览器先登录后退登」不会把访客误判为登录态（`hasEverHadUser` 语义）。

---

## 6. diff 摘要

```
 src/components/chat/hooks/__tests__/guest-journey.test.tsx | 440 ++++++++++++++++++++（新增）
 doc/demo-journey-e2e-result.md                            |  99 +++++++++（新增）
 2 files changed, 539 insertions(+)
```

**零生产代码改动**（`git status` 仅 2 个新增文件）。3 个断点（B-1 / B-2 / B-4）与 1 个契约边界（B-3）**均未擅自修复**：B-1/B-2 需产品决策，B-2 需 i18n 双语新增，B-4 需改 demo 回复队列语义（会影响既有用例），B-3 需与 B-1 一起决策。
