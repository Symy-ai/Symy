---
name: architecture-optimization-round-3
description: 架构优化 Round 3 — 全景扫描 + Lime 6 闭环评估 + 删除优先的优化方案
type: plan
---

# 架构优化 Round 3 — 全景扫描 + 删除优先

> 2026-08-04 | 基于 ref-lime-long-iteration.md《真正难的不是做一个 AI Demo》6 闭环要素
> 数据来源: 实际代码扫描 (非记忆文档)，扫描时 HEAD = `9c0bdd1`，migration max = 125

---

## 一、系统全景扫描（事实层）

### 1.1 规模统计（实际值，非记忆文档）

| 维度 | 数值 |
|------|------|
| src/ 文件总数 (.ts/.tsx) | 621 |
| src/ 总行数 | 124,027 |
| 单元测试条目 (vitest list) | **2,490** |
| 测试文件 (src/) | 122 |
| E2E spec (e2e/) | 3 |
| 架构守卫测试 | **115** (39 describe blocks) |
| Migration 文件数 | 125 (最新: 125_deposit_batch_rpc.sql) |
| TypeScript 错误 | 0 ✅ |
| ESLint warnings | 0 ✅ |

### 1.2 大文件现状（实际值，全部已达标）

**没有任何非测试文件超过 800 行。** 记忆文档中反复出现的"3 files >800 lines"已过时。当前 top 文件：

| 行数 | 文件 | 类型 |
|------|------|------|
| 795 | components/buddy-tab.tsx | .tsx 组件 |
| 791 | components/profile-tab.tsx | .tsx 组件 |
| 790 | features/butterfly/hooks/player/use-player-actions.ts | .ts hook |
| 786 | app/page.tsx | .tsx 页面 |
| 781 | components/chat/hooks/use-chat-actions.ts | .ts hook |
| 770 | app/api/butterfly/story/parts/stream-chapter.ts | API route |
| 759 | app/api/chat/route.ts | API route |
| 751 | lib/mcp-tools/handlers/complete_challenge.ts | lib |
| 746 | features/butterfly/components/butterfly-tab.tsx | .tsx 组件 |
| 740 | components/chat-tab.tsx | .tsx 组件 |
| 724 | features/butterfly/components/butterfly-history-detail.tsx | .tsx 组件 |

> 这些都在硬上限内但已接近上限。如果继续增长，下一轮应优先关注 buddy-tab.tsx / profile-tab.tsx（UI 组件，最易拆）。

### 1.3 按 src/ 一级目录行数分布

| 行数 | 文件数 | 目录 |
|------|--------|------|
| 39,941 | 168 | lib/ (业务逻辑、DB、Letta、邮件、MCP) |
| 34,193 | 206 | app/ (API routes + pages) |
| 23,072 | 112 | components/ (UI) |
| 21,643 | 90 | features/butterfly/ (蝴蝶效应子系统) |
| 4,456 | 32 | hooks/ |
| 269 | 7 | types/ |

### 1.4 ⚠️ 重大架构演进（记忆文档完全遗漏）

**Round 95 (commits b0bef4c + d38a917) 完成了 Dexie → React Query 的架构迁移：**
- 删除 `src/lib/buddy-sync.ts`（原 913-1034 行，god object）
- 删除 `src/hooks/use-buddy-state.ts`（原 694-960 行）
- 引入 `src/hooks/use-buddy-state-rq.ts`（536 行，React Query `useQuery` + `useMutation`）
- 引入 `src/lib/query-provider.tsx`（QueryClient 注入）
- 从 `package.json` 移除 dexie 依赖
- Dexie 仅在 architecture-guards.test.ts 作为"禁止回归"守卫存在

**影响**：buddy state 数据流从 "client-local-first + 双向同步" 变为 "server-source-of-truth + React Query 缓存"。这是好事（消除了一整类双向同步 bug），但 reality-status.md / feature-graph.md / exit-criteria.md / architecture-debt-policy.md 全部仍在描述旧的 Dexie/buddy-sync 路径——这就是 Lime 文章说的"文档不写现实"的典型症状。

---

## 二、Lime 6 闭环要素逐一评估

### (1) 文档写现实，不只写理想 — ❌ 严重失准

| 文档 | 失准程度 | 具体问题 |
|------|----------|----------|
| reality-status.md | 🔴 严重 | 仍把 buddy-sync.ts (855 行) / use-buddy-state.ts (694 行) 列为"当前不是完成态的模块"。二者早已删除。"最后更新 2026-07-12" |
| exit-criteria.md | 🟡 中度 | Chat/Buddy 段写"buddy-sync.ts <800 行 (_doPull 提取)"作为退出条件 — 文件已不存在。整个退出条件已无效 |
| architecture-debt-policy.md | 🔴 严重 | §架构债清单列出 buddy-sync 1034 行、use-buddy-state 960 行、butterfly-machine 786 行等。实际 buddy-sync 已删，butterfly-machine 624 行 |
| feature-graph.md | 🟡 中度 | "Buddy 持久化"段仍在描述 Dexie + adaptive polling → Realtime 迁移；全篇未提 React Query 迁移 |
| git-state.md | 🟢 基本准确 | 标注了合并状态和待决策审计项 |

**根因诊断**：worklog.md 是最新的（2452 tests / 115 guards），但记忆文档没有从 worklog 反向同步。Lime 文章第 (1) 条说的"防止人和 AI 一起自我催眠"正在发生——文档自我催眠已持续 ~3 周。

### (2) 测试画边界 — 🟢 强（但缺口存在）

- 2490 单元测试 + 115 架构守卫测试，是本项目最强资产
- 守卫覆盖：事件结构、安全、i18n、buddy-sync 已删除（防 Dexie 回归）、文件大小、层级、Zod、admin auth、migration 编号、no-eval、as-never 棘轮、CAS 守卫…
- **缺口 A（已部署修复缺守卫）**：exit-criteria.md 列的多个"守卫测试"实际未落地（如 `handleToolEvent 检查 justBoughtChallengeRef`、`gachaLimitReached 不含 "1 universe"`），需要核实哪些已转成守卫、哪些仍是 TODO
- **缺口 B（删除路径无守卫）**：见下方 §2.4 和 §3 的 dead code 列表——旧实现还在但没有"已删除目录不能恢复"守卫

### (3) GUI 验证闭环 — 🟡 框架在，覆盖薄

- Playwright E2E 框架已搭好 (playwright.config.ts + e2e/helpers.ts + CI workflow)
- **仅 3 个 P0 回归 spec**：p0-1-buy-button / p0-a-gacha-crash / p2-11-fill-history
- **未覆盖的关键用户路径**：
  - 登录/注册（含 Google OAuth）
  - 邮箱监控连接 + 扫描
  - Challenge 发起 → AI 回复 → I saw it / I choose to buy 双路径
  - Dream Fund 创建/编辑/删除
  - Gacha 限额用完状态
  - i18n 中英文切换
  - Buddy 陪伴感系统（P1-5：SVG 成长 / 个性 / 日常需求 / 主动留言）
  - Premium 候补名单
  - 邀请系统
- exit-criteria.md 大量 "E2E 测试: …(Playwright)" 都是 `[ ]` 未完成

### (4) 守卫保护方向 — 🟡 功能守卫强，方向守卫弱

Lime 文章强调的"方向守卫"（旧命令被重新 import → 失败 / 已迁出模块不能重新 import 旧路径 / mock 不能变生产 fallback / 已删除目录不能恢复）只部分覆盖：

- ✅ 已有：buddy-sync 删除守卫、Dexie 禁止回归守卫、文件大小上限守卫
- ❌ 缺失：上方 §1.4 列出的 dead code 路径**没有"禁止复活"守卫**。例如 `stream-complete-story.ts` 一旦被某个新 PR 重新 import，AI 会以为它是现役路径并继续在上面写代码（Lime 第 (2) 条的精确预言）

### (5) 进度必须可判断 — ❌ 失效

退出条件清单 (exit-criteria.md) 大量条目引用已不存在的文件（buddy-sync.ts、use-buddy-state.ts）。这违反 Lime 第 (5) 条："这是保护人的判断力的刹车点"——刹车点本身已经失效，无法判断真实进度。

### (6) 删除能力 — 🔴 最弱的一环

这是 Lime 文章的核心论点（"AI 生成代码太容易了，所以长期项目最稀缺的，反而是删除能力"）。本项目在"主动删除"上做得不够：~3,487 行 dead code 仍躺在仓库里（详见 §3）。新模块（React Query 迁移、Variable Reward、Pattern Alert、推送通知）确实让旧东西变少了（buddy-sync + Dexie 被删），但还有一大批"历史地层"没清理。

---

## 三、Dead Code 清单（实测，可直接执行删除）

> 用 grep -rl 验证"0 个生产代码 importer"。每项标注：行数、当前 importer、风险。

### 3.1 高置信度 dead code（0 importer，可立即删）

| 文件 | 行数 | 当前 importer | 备注 |
|------|------|---------------|------|
| `features/butterfly/hooks/use-butterfly-demo-session.ts` | 668 | 0 | Demo session 旧实现，被 use-butterfly-demo-player.ts 替代 |
| `app/api/butterfly/story/parts/stream-complete-story.ts` | 454 | 0 | 与 stream-chapter/stream-all-story 平行，全量生成旧路径 |
| `components/chat/hooks/use-challenge-mode.ts` | 197 | 0 | Challenge mode 旧 hook |
| `components/chat/parts/dream-fund-deposit-modal.tsx` | 188 | 0 | 被 `chat/deposit-dialog.tsx` 完全替代 |
| `components/floating-pill.tsx` | 92 | 0 | 未使用的 UI 组件 |
| `hooks/use-challenge-creation.ts` | 149 | 0 | 旧 challenge 创建 hook |
| `hooks/use-debounced-fetch.ts` | 151 | 0 | 旧 fetch hook（React Query 后无意义） |
| `hooks/use-realtime-table.ts` | 96 | 0 | 通用 realtime hook，无消费方 |
| `lib/email/imap-scan.ts` | 216 | 0 | 旧 IMAP 扫描实现 |
| `app/api/admin/letta/actions/register_mcp_tools.ts` | 14 | 0 | 孤儿 action 文件 |

**小计：2,225 行可直接删除。**

### 3.2 "test-only importer" dead code（生产已不用，仅自己的 test 文件 import）

| 文件 | 行数 | 备注 |
|------|------|------|
| `lib/intent-detection.ts` | 478 | 只有 `__tests__/intent-detection.test.ts` 引用。critical.md §定位铁律还说"intent-detection.ts 的 regex 同时接受所有措辞"——但生产代码已不调用 |
| `lib/llm-client.ts` | 330 | 文件头注释自己写"LLM 配置已移至 src/lib/llm-client.ts（统一调用层）"但实际已被 zai-sdk-types.ts 替代。只有 `__tests__/llm-client.test.ts` 引用 |
| `lib/mcp-letta-tools.ts` | 344 | 只有 `test/setup.ts` 注释提及。MCP 工具定义已迁移到 `lib/mcp-tools/handlers/` |

**小计：1,152 行。** 删除时需同时删除对应的 test 文件，或评估 test 是否还有价值迁移。

### 3.3 需人工确认的（疑似 dead，需 1 次确认）

| 文件 | 行数 | 疑点 |
|------|------|------|
| `features/butterfly/components/tab/demo-scene-player.tsx` | ? | 0 importer，但可能被 dynamic import 或字符串引用 |
| `app/api/butterfly/illustration-demo/route.ts` | ? | Demo illustration API，需确认是否还在 demo 路径 |
| `components/ui/dropdown-menu.tsx` + `separator.tsx` | 285 | shadcn 残留（feature-graph 说 014 精简时删了全部 shadcn/ui，但这两个还在） |

---

## 四、优化方案（按优先级排序）

### P0 — 立即执行（本周）

#### P0-1. 删除高置信度 dead code（~2,225 行）
- 删除 §3.1 列出的 10 个文件
- 同步删除对应的 test 文件（如果有）
- **必须配套**：在 architecture-guards.test.ts 新增"已删除文件不能复活"守卫，参考现有 buddy-sync 删除守卫写法
- 验证：`bun run test` + `bun run lint` + `bun run build` 全过

#### P0-2. 同步 reality-status.md 到现实
按实际代码重写以下段落（当前全部失准）：
- §整体完成度：删除 buddy-sync/use-buddy-state 行数引用，加入 React Query 迁移说明
- §当前不是完成态的模块：移除 buddy-sync.ts / use-buddy-state.ts（已不存在）
- §已知技术债：移除"buddy-sync.ts 855 行 / use-buddy-state.ts 694 行 / butterfly-machine 786 行"
- §事实源映射：dream funds / buddy state 改为 React Query 缓存（server SoT），删除 Dexie 行
- 更新"最后更新"为 2026-08-04，测试数 2490

#### P0-3. 同步 exit-criteria.md 到现实
- Chat 挑战系统 §退出条件：删除"chat-tab.tsx <800 行"（已 740 行达标）
- Buddy State 系统 §退出条件：删除"buddy-sync.ts <800 行"（文件已删除）
- Butterfly §退出条件：butterfly-machine.ts 已 624 行（<800 达标）
- 新增"React Query 迁移完成"退出条件（已满足，标记 ✅）

#### P0-4. 同步 architecture-debt-policy.md §架构债清单
- 删除已不存在的超限文件行（buddy-sync 1034、use-buddy-state 960）
- 更新"当前超限文件"为 0 个
- 保留文件大小硬规则 §14（仍有效）

### P1 — 本轮执行（2 周内）

#### P1-1. 处理 test-only dead code（~1,152 行）
- 评估 `intent-detection.ts` / `llm-client.ts` / `mcp-letta-tools.ts` 的 test 是否还有迁移价值
- 若无：删除文件 + test
- 若有：把有用的逻辑迁移到现役路径，再删原文件
- **特别注意**：critical.md §定位铁律仍引用 intent-detection.ts 的 regex 行为，如果删除需同步更新 critical.md（说明 regex 现在在哪）

#### P1-2. 补"方向守卫"（Lime 第 (4) 条）
为 P0-1 删除的每个文件添加 architecture-guards 守卫：
```typescript
describe('Architecture Guards: Deleted files must not be restored (Round 3)', () => {
  const deletedFiles = [
    'src/features/butterfly/hooks/use-butterfly-demo-session.ts',
    'src/app/api/butterfly/story/parts/stream-complete-story.ts',
    // ... P0-1 全部列表
  ];
  for (const f of deletedFiles) {
    test(`${f} must not exist`, () => {
      expect(fs.existsSync(path.join(process.cwd(), f))).toBe(false);
    });
  }
});
```

#### P1-3. 补 E2E 关键路径（Lime 第 (3) 条）
优先补 3 个最高价值场景（超越现有 3 个 P0）：
- `e2e/auth-login.spec.ts` — 登录成功 + 登录态保持
- `e2e/challenge-flow.spec.ts` — Challenge 发起 → AI 回复 → I saw it / I choose to buy 双路径
- `e2e/dream-fund-crud.spec.ts` — Dream Fund 创建/编辑/删除

### P2 — 中期（1 个月）

#### P2-1. 清理"历史地层"注释
代码中大量 `🔧 ARCH fix (Round 47)` / `🔧 Round 78` / `🔧 P0-3 fix (2026-07-18, AUDIT-LETTA-AGENT-MGR)` 注释。这些是宝贵的修复记录，但已成噪音。建议：
- 保留 6 个月内的 fix 注释
- 把超过 6 个月的迁移到 `.memory/fix-history.md`（按 Round 索引）
- 代码中只保留"为什么这样写"的架构决策注释

#### P2-2. 评估 illustration 引擎重复
四个 illustration 相关文件 (`illustration-engine.ts` 615 / `client-illustration-engine.ts` / `svg-illustration-engine.ts` / `illustration-actors.ts`) 有职责重叠。建议架构师评估是否能合并为 2 个（server-side + client-side），消除概念混淆。

#### P2-3. 评估 letta-agent-manager 与 letta-agent-pool 合并
- `letta-agent-manager.ts` (640 行) — per-user agent 生命周期
- `letta-agent-pool.ts` (607 行) — 预创建无主 agent 池
- 二者都 import 自 `letta-mcp-manager.ts`，职责相邻。若合并为一个 `letta-agent-lifecycle.ts` 可减少概念分裂。

### P3 — 长期（视情况）

#### P3-1. memory 文档 SSOT 重整
当前 `.memory/` 有 17 个文件，多处重复描述同一事实（buddy-sync 在 reality-status / exit-criteria / debt-policy / feature-graph 都有描述，且全部失准）。建议：
- 每个事实只在一处定义（已有此规则但执行不严）
- 加一个"文档健康度"守卫：每周扫描 `.memory/` 中引用的文件路径是否存在，不存在则标记 stale

#### P3-2. 推送通知 + Variable Reward + Pattern Alert 的退出条件
这些是 Round 90-94 新加的子系统，exit-criteria.md 完全没有它们的退出条件。需要补写。

---

## 五、退出条件（本 Round 3 的"真正完成"标准）

- [ ] P0-1: 10 个 dead code 文件删除 + 守卫添加
- [ ] P0-2: reality-status.md 重写（删除 buddy-sync/use-buddy-state 引用，加入 React Query）
- [ ] P0-3: exit-criteria.md 重写（删除已无效退出条件）
- [ ] P0-4: architecture-debt-policy.md §架构债清单更新（超限文件 = 0）
- [ ] P1-1: 3 个 test-only dead code 处理完
- [ ] P1-2: "已删除文件不能复活"守卫上线
- [ ] 验证: `bun run test` (≥2490 通过) + `bun run lint` (0 warnings) + `bun run build` (成功)
- [ ] .memory/MEMORY.md 索引加入本文件
- [ ] .memory/git-state.md 更新

---

## 六、建议的 dev 执行步骤（可直接照做）

### 步骤 1：P0-1 删除 dead code（developer 执行）
```bash
# 删除 10 个高置信度 dead 文件
git rm src/features/butterfly/hooks/use-butterfly-demo-session.ts
git rm src/app/api/butterfly/story/parts/stream-complete-story.ts
git rm src/components/chat/hooks/use-challenge-mode.ts
git rm src/components/chat/parts/dream-fund-deposit-modal.tsx
git rm src/components/floating-pill.tsx
git rm src/hooks/use-challenge-creation.ts
git rm src/hooks/use-debounced-fetch.ts
git rm src/hooks/use-realtime-table.ts
git rm src/lib/email/imap-scan.ts
git rm src/app/api/admin/letta/actions/register_mcp_tools.ts

# 验证
bun run test && bun run lint && bun run build
```

### 步骤 2：P1-2 添加方向守卫（developer 执行）
在 `src/lib/__tests__/architecture-guards.test.ts` 末尾添加 §P1-2 的 describe block，列出删除的文件。

### 步骤 3：P0-2/3/4 文档同步（coordinator 执行，不涉及代码）
按本文件 §四 P0-2/P0-3/P0-4 的清单逐项更新 3 个 .memory 文档。

### 步骤 4：P1-1 test-only dead code（需 architect 先评估）
- architect 审查 `intent-detection.ts` / `llm-client.ts` / `mcp-letta-tools.ts` 是否还有迁移价值
- 输出决策：删 / 迁移 / 保留
- developer 执行 architect 的决策

### 步骤 5：commit + push
```bash
git add src/lib/__tests__/architecture-guards.test.ts .memory/
git commit -m "refactor(arch): Round 3 — delete 2225 lines dead code + sync memory docs

- Delete 10 dead files (0 production importers)
- Add 'deleted files must not be restored' guards
- Sync reality-status.md / exit-criteria.md / debt-policy.md to post-React-Query reality
- Based on Lime long-iteration 6-closedloop assessment"
git push origin main
```

---

## 七、Lime 文章对账表

| Lime 6 要素 | 本项目状态 | 本 Round 行动 |
|-------------|-----------|---------------|
| (1) 文档写现实 | ❌ 严重失准 | P0-2/3/4 重写 3 个文档 |
| (2) 测试画边界 | 🟢 强 + 缺口 | P1-1 清理 test-only dead code |
| (3) GUI 验证闭环 | 🟡 框架在覆盖薄 | P1-3 补 3 个 E2E |
| (4) 守卫保护方向 | 🟡 功能强方向弱 | P1-2 加"禁止复活"守卫 |
| (5) 进度可判断 | ❌ 退出条件失效 | P0-3 重写 exit-criteria |
| (6) 删除能力 | 🔴 最弱 | P0-1 删 2225 行 + P1-1 删 1152 行 |

**本 Round 净删除目标：≥3,377 行 dead code + 3 个失准文档重写。新增代码：仅守卫测试。**
