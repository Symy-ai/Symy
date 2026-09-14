---
name: reality-status
description: 项目现实状态 — 写现实不写理想, 每周更新. 当前不是完成态的模块 + 已知技术债 + 下一刀方向.
type: state
---

# Symy 现实状态

> ⚠️ **每周更新** — 不写"进展顺利", 写"整体完成度 X%, 哪个依赖还没删"。
> 目的: 防止人和 AI 一起自我催眠。

> 最后更新: 2026-08-04 (架构优化 Round 3 — 删除 2,225 行 dead code + 文档同步现实)

## Round 3: 架构优化 — 删除优先 ✅ (2026-08-04)

基于《真正难的不是做一个 AI Demo》6 闭环要素评估, 执行删除优先策略:
- 删除 10 个零引用 dead code 文件 (2,225 行)
- 新增 20 个"禁止复活"守卫测试 (文件不存在 + 无 import)
- 同步 reality-status.md / exit-criteria.md / architecture-debt-policy.md 到现实
- **修正确率**: 之前 3 个文档全部在描述已删除的 buddy-sync.ts / use-buddy-state.ts / Dexie 路径

### Round 95: Dexie → React Query 迁移 ✅ (2026-07-12, commits b0bef4c + d38a917)

**重大架构演进** (记忆文档此前完全遗漏):
- 删除 `src/lib/buddy-sync.ts` (原 913-1034 行, god object)
- 删除 `src/hooks/use-buddy-state.ts` (原 694-960 行)
- 引入 `src/hooks/use-buddy-state-rq.ts` (536 行, React Query useQuery + useMutation)
- 引入 `src/lib/query-provider.tsx` (QueryClient 注入)
- 从 package.json 移除 dexie 依赖
- buddy state 数据流: "client-local-first + 双向同步" → "server-source-of-truth + React Query 缓存"

### Round 120: 架构重构 + 审计闭环 ✅ (2026-07-12, 历史)

5 个并行子代理审计 (AUDIT-1..5) + 6 batch 修复 + 1 对抗式重审 (AUDIT-6):
- 9 P0 bug 修复 (letta-agent-manager 回归 + MCP 加固 + 后门 + 静默失败 + deposit_status NOT NULL + trigger_source CHECK)
- 10 P1 bug 修复 (gacha exploit + BNPL refund + 锁泄漏 + 数据丢失 + CAS 失败撒谎)
- 105 新测试 (bnpl-detector 51 + letta-agent-manager 47 + refund-challenge-quota 7)

### P1-5 宠物陪伴感与个性成长系统 ✅ (2026-07-10, Round 84)

4 大子系统已实现 (commit 03a0da38):
1. **视觉成长系统**: 4 阶段 SVG (baby/young/adult/elder)
2. **个性系统**: 4 种个性 (sage/playmate/guardian/ascetic), 7 天觉醒
3. **日常需求系统**: 3 维度 (clarity/connection/breath), 每日衰减
4. **主动留言系统**: 10 种触发, 24h 防重复

⚠️ **待用户手动执行**: migration 089 (supabase/migrations/089_buddy_companion_system.sql)

## 实际规模统计 (2026-08-04 扫描, HEAD 9c0bdd1)

| 维度 | 数值 |
|------|------|
| src/ 文件总数 (.ts/.tsx) | 611 (删 10 后) |
| src/ 总行数 | ~121,800 (删 2,225 后) |
| 单元测试条目 | **2,490** |
| 架构守卫测试 | **135** (原 115 + Round 3 新增 20) |
| 测试文件 (src/) | 122 |
| E2E spec (e2e/) | 3 |
| Migration 文件数 | 125 |
| TypeScript 错误 | 0 ✅ |
| ESLint warnings | 0 ✅ |
| 超过 800 行的非测试文件 | **0** ✅ |

## 整体完成度

- **Chat 挑战系统**: ~93% (核心功能完成, chat-tab 740 行, use-chat-actions/use-chat-history 已提取)
- **Butterfly Gacha 系统**: ~88% (核心功能完成, 事件结构契约测试, XState typedAssign 类型安全)
- **Buddy 状态系统**: ~95% (Dexie → React Query 迁移完成, P1-5 陪伴感系统已加, migration 089 待执行)
- **Deposit/Dream Fund 系统**: ~92% (核心功能完成, fill history 已修复, multi-fund CAS 守卫)
- **i18n 镜子哲学**: ~95% (8 个 P0/P1/P2 bug 已修复)
- **邀请系统**: ~85% (CAS 防双倍奖励, crypto-secure ref_code, 4 路由迁移到 withAuth)
- **Premium 系统**: ~80% (候补名单, 价值矩阵, RLS WITH CHECK 防绕过)
- **Blind Spot Map**: ~90% (5 维度, 3 维度有数据, 21 tests 覆盖)
- **架构基础设施**: ~98% (135 架构守卫 tests, 文件大小全部达标, dead code 持续清理)

## 当前不是完成态的模块

### 1. chat-tab.tsx (740 行) — ✅ 已达标 (<800)
- **现状**: 已提取 challenge-prompt + use-challenge-fetch + use-chat-actions
- **下一刀**: 如需进一步缩减可提取 impulseContext effect

### 2. buddy state 系统 — ✅ 已迁移到 React Query
- **现状**: buddy-sync.ts / use-buddy-state.ts 已删除, 由 use-buddy-state-rq.ts (536 行) 替代
- **完成**: server-source-of-truth + React Query 缓存, 无双向同步 bug

### 3. letta-agent-manager.ts (640 行) — per-user agent 逻辑
- **现状**: 有 per-user agent 创建/同步逻辑, 但未完全启用 (仍用 shared agent)
- **历史包袱**: getOrCreateSharedMCPServer 有 userId scope bug 历史 (BUG-332, 已修复)

### 4. E2E 测试覆盖 — 框架在, 覆盖薄
- **现状**: 仅 3 个 P0 回归 spec (p0-1-buy-button / p0-a-gacha-crash / p2-11-fill-history)
- **缺口**: 登录/OAuth, Challenge 双路径, Dream Fund CRUD, Gacha 限额, i18n 切换, Buddy 陪伴感, Premium, 邀请系统

## 已知技术债

### 高优先级 (影响稳定性) — 大部分已修复 ✅
- [x] **事件结构不一致**: butterfly 事件 payload 契约测试已部署 (19 tests) ✅
- [x] **GUI 验证无自动化**: Playwright E2E CI 已集成 (3 P0 回归测试) ✅
- [x] **gacha player 恢复逻辑**: activeSessionHasPendingChoice guard 已修复 ✅
- [x] **层级违反**: hooks/lib 不再从 components 导入 (5 个守卫测试) ✅
- [x] **API 路由验证不一致**: 所有路由用 zod (3 个守卫测试) ✅
- [x] **module-level mutable RPC flags**: RpcHealth class 替代 (2 个守卫测试) ✅
- [x] **MCP handler 无测试**: 18 tests (add_tokens + record_impulse) ✅
- [x] **Chat API 无测试**: 5 tests (validation + error paths) ✅
- [x] **buddy-sync 双向同步**: 整个 buddy-sync/Dexie 体系已删除, React Query 替代 ✅
- [ ] **MCP 纯 secret 认证安全**: 需要 Letta per-user bearer token 迁移 (已知债务)
- [ ] **Deposit RPC 幂等性**: 需要 p_challenge_id 参数到 apply_buddy_state_delta (已知债务)

### 中优先级 (影响可维护性)
- [ ] **page.tsx 786 行**: 需拆分 onboarding/data-loader/impulse-alert hooks
- [ ] **butterfly-machine.ts 624 行**: 已达标 (<800), 可考虑 XState setup() 迁移
- [ ] **letta-agent-manager.ts 640 行**: 已达标 (<800), 可拆分 CRUD/batch/memory
- [ ] **test-only dead code** (P1): intent-detection.ts / llm-client.ts / mcp-letta-tools.ts 仅被自身 test 引用 (~1,152 行), 需评估是否删除

### 低优先级 (不影响功能)
- [ ] **i18n 默认值**: 部分 t() defaultValue 与 i18n 文件不一致
- [ ] **XState typedAssign as any**: 需迁移到 setup() pattern (消除 50+ 处 as any)
- [ ] **代码注释噪音**: 大量 `🔧 ARCH fix (Round 47)` 注释已成历史地层, 建议超 6 个月的迁移到 fix-history.md

## 事实源映射 (Source of Truth)

> 每轮迭代回答: "同一种能力, 到底听谁的?"

| 数据 | 事实源 | 缓存层 | 同步方向 |
|------|--------|--------|----------|
| buddy state (vitality/tokens/level) | `buddy_state` JSONB (Supabase) | React Query 缓存 (use-buddy-state-rq.ts) | server → cache (useQuery), mutation → server (useMutation + optimistic update) |
| dream funds | `buddy_state.dreamFunds` JSONB | React Query 缓存 | server → cache, mutation → server |
| gacha count | `buddy_state.gacha_pulls_count` | React Query 缓存 | server → cache |
| health events | `health_events` 表 | 无 (无冗余) | 只写不读 (审计日志) |
| chat messages | `chat_messages` 表 | 无 | 只写不读 |
| butterfly sessions | `butterfly_sessions` 表 | React Query 缓存 | server → cache |
| 插图 | 服务端 AI 生成 → `butterfly_sessions.chapters[].illustrationUrl` | 客户端 AI fallback | server → local (polling) |

> **变更说明 (Round 95)**: 原 Dexie 本地缓存 + buddy-sync 双向同步已完全移除。React Query 作为纯缓存层, server 是唯一事实源, 不再有 client → server push 同步路径。

## 下一刀应该先打哪里

1. **P1-1 test-only dead code** — 评估 intent-detection.ts / llm-client.ts / mcp-letta-tools.ts (~1,152 行) 是否删除
2. **P1-3 E2E 关键路径** — 补 auth-login / challenge-flow / dream-fund-crud 3 个 spec
3. **page.tsx 拆分** — 786 行, 提取 onboarding/data-loader hooks
4. **注释清理** — 超 6 个月的 🔧 ARCH fix 注释迁移到 fix-history.md

## 守卫清单 (已部署的修复, 不能回退)

- ✅ `justBoughtChallengeRef` — buy 路径不弹存款对话框 (P0-1)
- ✅ `assignClientIllustration` 读 `event.chapterIndex` 不读 `event.data.chapterIndex` (P0-A)
- ✅ `assignPollingUpdate` 检查 `ILLUSTRATION_POLLING_UPDATE` 不检查 `ILLUSTRATION_POLLING_DONE` (P0-A)
- ✅ `activeSessionHasPendingChoice` 检查 `session.status !== 'completed'` (player 卡住修复)
- ✅ `gachaLimitReached` 文案是 "Daily limit reached" 不是 "1 universe" (误导修复)
- ✅ buddy-sync.ts / use-buddy-state.ts 已删除 (React Query 替代, 防止 Dexie 回归)
- ✅ `deposit_api` trigger_source (migration 083)
- ✅ service_role key 不出现在客户端组件
- ✅ Round 3: 10 个 dead code 文件不能复活 (20 守卫测试: 文件不存在 + 无 import)
