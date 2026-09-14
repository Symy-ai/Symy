# AI 工具接口设计原则

> 核心原则：**已知的、确定的信息由 App 处理；必须 AI 判断的才让 AI 处理。**
> 让 AI 只做最小决策，降低参数错误率，提升系统稳定性。

## 设计铁律

### 1. 最小决策原则
AI 调用工具时只传**必须由 AI 判断**的参数。所有 App 已知的、确定的信息由 handler 自动获取或从上下文读取。

**反例**（避免）：
```typescript
// ❌ AI 需要传 5 个参数，容易出错
complete_challenge({
  user_id: "xxx",        // App 已知（从 auth context 取）
  challenge_type: "boss", // App 可根据 amount 自动判断
  saved_amount: 299,      // App 已知（challengeContext.amount）
  fund_id: "df-2",        // App 可自动选第一个未完成的 fund
  badge_id: "boss_slayer" // App 可根据 challenge_type 自动判断
})
```

**正例**（理想）：
```typescript
// ✅ AI 只传 1 个必须判断的参数：挑战结果
complete_challenge({
  status: "passed"  // passed | failed — 这是 AI 唯一需要判断的
})
// handler 从 challengeContext / active_challenges 表自动取 amount, itemName, tier
```

### 2. 参数校验 + 自动修正原则
handler 必须校验 AI 传入的参数，错误时：
- **可自动修正的**（如 challenge_type 跟 amount 阈值不匹配）→ 自动修正 + 日志记录
- **不可修正的**（如 saved_amount=0）→ 返回 `"Failed: ..."` message，触发 AI retry

### 3. 幂等性原则
所有写操作必须幂等，AI retry 安全：
- 内存级锁 `isToolCallInProgress`（同实例并发）
- DB 级 dedup `isDuplicateHealthEvent`（trigger_id + 60s 窗口）
- 即使 AI 重复调用同一工具 10 次，buddy_state 只更新 1 次

### 4. 状态外置原则
挑战等需要跨多轮对话的会话状态，存 DB 表（如 `active_challenges`），不依赖前端 state 传递。
- AI 只需传 `challenge_id`（从 context header 读取）
- handler 通过 challenge_id 查表获取所有挑战信息（amount, itemName, tier）
- 挑战结束（passed/failed）时更新表状态

## 当前接口状态（2026-06-29 v2 — 全部重构完成）

### complete_challenge ✅ 完全重构
```typescript
// 模式 A（推荐）: AI 只传 challenge_id
complete_challenge({ challenge_id: "uuid" })
// handler 自动: 查表取 amount/itemName/challenge_type + 加 dream_fund + totalSaved + 创建 2 个 health_event

// 模式 B（降级）: AI 传 challenge_type + saved_amount
complete_challenge({ challenge_type: "boss", saved_amount: 299 })
// handler: 自动校验+修正 challenge_type, 不加 dream_fund (AI 需自己调 add_dream_fund_progress)
```
- ✅ challenge_id 模式: AI 只传 1 个参数, handler 自动完成所有
- ✅ CAS 防并发: completeChallenge 在 applyBuddyStateDelta 之前做, rowsAffected=0 则 deduplicated
- ✅ userId 校验: getChallengeById/completeChallenge 都加 .eq('user_id', userId)
- ✅ dream_funds 表同步: 用 RPC 返回的 post-delta 值 (S1 fix)
- ✅ challenge_reward triggerId 用 dfp: 格式, 防止 AI 误调 add_dream_fund_progress 导致 double

### add_dream_fund_progress ✅ 简化
```typescript
add_dream_fund_progress({ amount: 89 })  // fund_id 默认 "auto"
```
- ✅ fund_id 默认 "auto", required 从 ['fund_id','amount'] 改为 ['amount']
- ✅ amount 校验 > 0 + Number.isFinite (M2 fix)

### record_impulse ✅ 简化
```typescript
record_impulse({ amount: 150 })  // platform 默认 "unknown", impulse_score 默认 70
```
- ✅ required 从 ['amount','platform','impulse_score'] 改为 ['amount']
- ✅ platform 默认 "unknown" + lowercase
- ✅ impulse_score 默认 70
- ✅ amount 校验 > 0 + Number.isFinite (M2 fix)

### add_tokens ✅ 简化
```typescript
add_tokens({})  // amount 默认 3, reason 默认 "pleasure"
```
- ✅ required 从 ['amount','reason'] 改为 []
- ✅ amount 默认 3, 限制 1-50
- ✅ Number.isFinite 校验 (M2 fix)

### add_badge / add_vitality ✅ 设计已合理
- AI 必须判断 badge_id / amount + reason, 无法内化

## active_challenges 表（migration 031，已建）

```sql
-- supabase/migrations/031_create_active_challenges_table.sql
CREATE TABLE public.active_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  challenge_type TEXT NOT NULL CHECK (challenge_type IN ('quick_pass', 'standard', 'boss')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'passed', 'failed', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- 每个用户同时只能有一个 active challenge
CREATE UNIQUE INDEX active_challenges_user_active_uniq
  ON active_challenges(user_id) WHERE status = 'active';
```

**Trigger 自动计算 challenge_type**（AI 不需要传）：
- amount ≤ 30 → quick_pass
- 30 < amount ≤ 200 → standard
- amount > 200 → boss

**新接口**（待代码层实施）：
```typescript
// 前端发起挑战时
INSERT INTO active_challenges (user_id, item_name, amount) VALUES (...)
-- challenge_type 由 trigger 自动计算
-- 返回 challenge_id

// context header 注入 challenge_id
[Context: user_id: UUID | challenge_id: UUID | ...]

// AI 调用（简化版）
complete_challenge({
  challenge_id: "uuid-from-context",  // AI 从 context 读取
  status: "passed" | "failed"          // AI 唯一需要判断的
})
// handler 通过 challenge_id 查表自动取 amount, itemName, challenge_type
// 自动调用 add_dream_fund_progress（无需 AI 配对调用）
```

**实施步骤**（全部完成 ✅）：
1. ✅ DB migration 031 建表（已完成）
2. ✅ 前端 challenge 发起时 INSERT active_challenges，拿 challenge_id
3. ✅ route.ts context header 注入 challenge_id（替代当前的 challenge: itemName $amount）
4. ✅ complete_challenge handler 改为接收 challenge_id + status，查表取其他字段
5. ✅ 挑战结束（passed/failed）时 UPDATE status（CAS 改造，防并发）
6. ✅ complete_challenge 自动加 dream_fund + totalSaved（challenge_id 模式）
7. ✅ 对抗式审查修复 S1/S2/S3/M2/M3

## 对抗式审查历史教训（2026-06-29）

| 问题 | 严重度 | 修复 | 状态 |
|---|---|---|---|
| S1: dream_funds 表 double-count | P0 | 用 RPC 返回的 post-delta 值同步 | ✅ 已修复 |
| S2: 跨用户 challenge_id | P0 | getChallengeById/completeChallenge 加 userId 校验 | ✅ 已修复 |
| S3: 跨实例并发竞态 | P1 | CAS 改造，completeChallenge 在 delta 之前做 | ✅ 已修复 |
| M1: 跨 fund dedup 漏洞 | P2 | challenge_reward triggerId 用 dfp: 格式 | ✅ 已修复 |
| M2: NaN 绕过校验 | P2 | Number.isFinite 校验 | ✅ 已修复 |
| M3: Prompt 矛盾 | P2 | 改为条件式描述 | ✅ 已修复 |
| P1 (3c+3d): dedup key 跨挑战碰撞 | P1 | challenge_id 模式用 cc:userId:challengeId | ✅ 已修复 |
| P2: failed 模式复用 impulse_confessed | P2 | 新增 challenge_failed eventType (migration 032) | ✅ 代码已改, 需执行 migration |
| P3a: 30分钟 active 过期 | P3 | DB trigger (migration 033) + 应用层过滤 | ✅ 代码已改, 需执行 migration |
| P3b: 表无定期清理 | P3 | pg_cron (migration 034) | ✅ 代码已改, 需执行 migration + 启用 pg_cron |

## 设计检查清单

新增/修改 AI 工具接口时，逐项检查：
- [ ] 每个参数是否**必须 AI 判断**？App 已知的应内化到 handler
- [ ] 参数是否有默认值或自动修正逻辑？
- [ ] handler 是否校验参数合理性，错误时返回 "Failed:" 触发 retry？
- [ ] **Number.isFinite 校验**防 NaN 绕过？（不能用 Math.max(0, Number(x))）
- [ ] 写操作是否幂等（重复调用安全）？
- [ ] 跨轮会话状态是否存 DB（不依赖前端传递）？
- [ ] **跨用户安全**：DB 查询/更新是否加 user_id 校验？
- [ ] **并发安全**：是否有 CAS 或 advisory lock 防跨实例 double delta？
- [ ] **dream_fund 同步**：用 RPC 返回的 post-delta 值，不要读后再加？

## 历史教训

- **Bug A (2026-06-28)**: AI 偶发传 saved_amount=0，导致 buddy_state 更新但 health_event 未落库
  → 修复：handler 加 saved_amount > 0 校验 + 自动修正 challenge_type
- **N46 (2026-06-29)**: Challenge 中用户发非投降消息时 AI 不回复
  → 根因：challengeContext 没注入到 user message context，AI 失去挑战上下文
  → 修复：route.ts 把 challengeContext 注入 context header + AI_Prompt.md 加 ACTIVE CHALLENGE HANDLING 段
- **S1 (2026-06-29)**: dream_funds 独立表 double-count
  → 根因：complete_challenge 同步 dream_funds 表时读了 post-delta current 再 +savedAmount
  → 修复：用 RPC 返回的 result.dreamFunds 里的 current 值
- **S2 (2026-06-29)**: 跨用户 challenge_id 安全漏洞
  → 根因：getChallengeById/completeChallenge 只按 id 查询，没有 user_id 校验
  → 修复：加 .eq('user_id', userId)
- **S3 (2026-06-29)**: 跨实例并发竞态导致 double delta
  → 根因：先 applyBuddyStateDelta 再 UPDATE status，TOCTOU 窗口
  → 修复：CAS 改造，先 UPDATE status WHERE status='active'，rowsAffected=0 则 deduplicated
- **M2 (2026-06-29)**: NaN 绕过 amount 校验
  → 根因：Math.max(0, Number('abc')) = NaN，NaN <= 0 = false
  → 修复：Number.isFinite 校验
