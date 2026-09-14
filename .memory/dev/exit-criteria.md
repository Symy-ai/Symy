---
name: exit-criteria
description: 退出条件清单 — 每个功能模块的"真正完成"标准. 每轮迭代更新.
type: plan
---

# Symy 退出条件清单

> 每个模块的"真正完成"标准。不写"进展顺利", 写具体可验证的退出条件。
> 每轮迭代结束时检查并更新。

> 最后更新: 2026-08-04 (架构优化 Round 3 — dead code 删除 + 文档同步现实)

## Chat 挑战系统

### 核心功能
- [x] 挑战创建 → AI 镜子回复 → I saw it / I choose to buy 两条路径
- [x] "I choose to buy" 不弹存款对话框 (P0-1 修复)
- [x] "I choose to buy" 显示正确 toast ("You saw it. You're free.")
- [x] 挑战发起消息用镜子语调 ("I'm moved by X · $Y · Let me see it")
- [x] Give Up 路径触发存款对话框
- [x] 存款对话框显示镜子文案 ("Your seeing, remembered.")

### 测试覆盖
- [x] 单元测试: use-challenge-actions, consume-ai-stream, handleToolEvent
- [ ] E2E 测试: buy 路径不弹存款对话框 (Playwright)
- [ ] E2E 测试: resist 路径弹存款对话框 + 存款成功
- [ ] 守卫: justBoughtChallengeRef 不能被移除

### 退出条件
- [ ] E2E 测试覆盖 buy/resist 两条路径
- [ ] 守卫测试: handleToolEvent 检查 justBoughtChallengeRef
- [x] chat-tab.tsx <800 行 ✅ (当前 740 行)

---

## Butterfly Gacha 系统

### 核心功能
- [x] Gacha pull → 故事生成 → 章节展示 → 选择 → 完成
- [x] P0-A 事件结构崩溃修复 (event.data → event.chapterIndex)
- [x] P0-B gacha count 不在错误时消耗 (chapter_start effect)
- [x] completed session 恢复不卡 choosing (guard 修复)
- [x] gacha 限额文案正确 ("Daily limit reached" 不是 "1 universe")

### 测试覆盖
- [x] 单元测试: sse-event-mapper, preload-logic, reducer
- [x] 单元测试: machine-guards (activeSessionHasPendingChoice)
- [x] E2E 测试: gacha pull → 故事生成 → 无崩溃 (p0-a-gacha-crash.spec.ts)
- [ ] E2E 测试: 限额用完后按钮 disabled + 正确文案
- [x] 守卫: machine-actions-illustration 不能重新引入 event.data 访问
- [x] 守卫: gachaLimitReached 文案不能重新引入 "1 universe"
- [x] 事件结构契约测试 (event-contracts.test.ts, 19 tests)

### 退出条件
- [x] E2E 测试覆盖主路径 (p0-a-gacha-crash.spec.ts)
- [x] 事件结构契约测试 (event-contracts.test.ts)
- [x] 守卫测试: event.data 不能出现在 illustration actions
- [x] butterfly-machine.ts <800 行 ✅ (当前 624 行)

---

## Deposit / Dream Fund 系统

### 核心功能
- [x] 挑战通过后弹存款对话框
- [x] 存款 → dream_funds.current 更新 + health_event 创建
- [x] Fill history 显示存款记录 (P2-11 修复, migration 083)
- [x] deposit_api trigger_source (migration 083)
- [x] 存款对话框弱化代币显示 ("Your seeing, remembered.")
- [x] Multi-fund deposit CAS + no-rollback 守卫 (Round 120)

### 测试覆盖
- [x] 单元测试: deposit route (route.test.ts)
- [x] 单元测试: React Query mutation (use-buddy-state-rq.ts)
- [x] E2E 测试: 存款 → Fill history 显示记录 (p2-11-fill-history.spec.ts)
- [x] 守卫: deposit route 必须创建 health_event
- [x] 守卫: deposit no-rollback CAS (guard #22)

### 退出条件
- [x] E2E 测试: 存款 → fill history 一致 (p2-11-fill-history.spec.ts)
- [x] 守卫: deposit_api trigger_source 在 VALID_TRIGGER_SOURCES
- [ ] 旧数据回填 (现有 dream_funds 无 deposit_api health_event 记录)

---

## Buddy State 系统

### 核心功能
- [x] buddy_state JSONB 是唯一事实源 (server-source-of-truth)
- [x] **Dexie → React Query 迁移完成** (Round 95, commits b0bef4c + d38a917)
- [x] buddy-sync.ts + use-buddy-state.ts 已删除
- [x] use-buddy-state-rq.ts (536 行) 使用 React Query useQuery + useMutation + optimistic update

### 测试覆盖
- [x] 守卫: buddy-sync.ts 不存在 (React Query 替代)
- [x] 守卫: dexie 不在 package.json
- [x] 守卫: use-buddy-state-rq.ts 存在

### 退出条件
- [x] ✅ **React Query 迁移完成** (buddy-sync/Dexie 全部删除)
- [x] 守卫: buddy-sync.ts 不含 `fundMap` 或 `serverFunds` 内联逻辑 (文件已删除)

---

## i18n 镜子哲学

### 核心功能
- [x] tabs.profile = "Me" (不是 "Are")
- [x] buddy.badges = "Marks of your seeing" (不是 "Badges")
- [x] dailyRitual.mirrorWalkerName = "Mirror Walker" (不是邮箱前缀)
- [x] chat.deposit.seeingRemembered = "Your seeing, remembered."
- [x] gachaLimitReached = "Daily limit reached" (不是 "1 universe")

### 测试覆盖
- [ ] 守卫: gachaLimitReached 不含 "1 universe"
- [ ] 守卫: tabs.profile 不含 "Are"

### 退出条件
- [ ] 守卫测试: 关键 i18n key 不能回退到旧文案
- [ ] 中文环境全量验证

---

## 架构基础设施

### 已完成
- [x] .memory/reality-status.md (现实状态文档)
- [x] .memory/exit-criteria.md (退出条件清单)
- [x] .memory/architecture-optimization-plan.md (优化计划)
- [x] **Dexie → React Query 迁移** (buddy-sync.ts + use-buddy-state.ts 删除)
- [x] architecture-guards.test.ts (135 架构守卫测试)
- [x] Playwright E2E 框架搭建 (playwright.config.ts + e2e/helpers.ts)
- [x] 3 个 P0 回归 E2E 测试 (p0-1, p0-a, p2-11)
- [x] 事件结构契约测试 (event-contracts.test.ts, 19 tests)
- [x] chat-tab.tsx 拆分 (challenge-prompt + use-challenge-fetch, 当前 740 行)
- [x] Playwright E2E CI 集成 (.github/workflows/e2e-tests.yml)
- [x] CI 自动上传测试报告 + 截图 artifacts
- [x] **Round 3 dead code 清理** (10 文件 / 2,225 行删除 + 20 禁止复活守卫)

### 退出条件
- [x] 架构守卫测试覆盖所有"守卫清单"项
- [x] Playwright E2E 框架 + 3 个 P0 回归测试
- [x] 事件结构契约测试 (19 tests)
- [x] Playwright E2E 在 CI 中运行 (e2e-tests.yml)
- [x] 每轮迭代更新 reality-status.md + exit-criteria.md
- [x] 所有非测试文件 ≤800 行 ✅
