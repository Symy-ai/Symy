---
name: arch-optimization-round-2
description: 架构优化 Round 2 总结 — Playwright E2E + chat-tab 拆分 + 事件契约 + buddy-sync 统一
type: summary
---

# 架构优化 Round 2 总结

> 2026-07-08 | 基于《真正难的不是做一个 AI Demo》文章原则
> Commit: `d12c0a5a` (推送到 main)

## 团队同步

本次架构优化基于 Lime 项目迭代感悟文章的 5 个闭环原则：
1. 文档写现实，不只写理想
2. 测试给 AI 画边界
3. GUI 验证进入闭环
4. 守卫保护方向，不只保护功能
5. 进度必须可判断

### 本轮完成的工作（4 项）

#### 1. Playwright E2E 框架 + 3 个 P0 回归测试

新增文件：
- `playwright.config.ts` — 移动端视口，串行执行，3 分钟超时
- `e2e/helpers.ts` — 登录 + gacha reset + session 清理
- `e2e/p0-1-buy-button.spec.ts` — buy 按钮不弹存款对话框
- `e2e/p0-a-gacha-crash.spec.ts` — gacha 故事生成不崩溃
- `e2e/p2-11-fill-history.spec.ts` — deposit 后 fill history 显示记录

运行方式：
```bash
npx playwright test                    # 运行所有 E2E
npx playwright test --grep "buy"       # 只运行 buy 相关
npx playwright test --headed           # 显示浏览器窗口
```

#### 2. chat-tab.tsx 拆分 — 864→774 行（目标 <800 ✅）

新增文件：
- `chat/parts/challenge-prompt.ts` — 挑战提示词构造（从 chat-tab 提取 ~40 行）
- `chat/hooks/use-challenge-fetch.ts` — 活跃/过期挑战获取（从 chat-tab 提取 ~60 行）

架构守卫更新：chat-tab 限制从 900 → 800 行

#### 3. 事件结构契约测试 — 19 tests

新增文件：`features/butterfly/hooks/session/__tests__/event-contracts.test.ts`

验证 butterfly 事件 payload 位置一致性：
- SSE 事件（CHAPTER_START 等）：payload 在 `.data` ✅
- Actor 事件（CLIENT_ILLU_DONE 等）：payload 在顶层 ✅
- Preload 事件（PRELOAD_CHAPTER_DONE 等）：payload 在 `.data` ✅
- Actions 读取正确位置（P0-A fix 不回退）✅

#### 4. buddy-sync.ts 合并逻辑统一

- 旧代码有两套 merge 逻辑（409 conflict 用 server 顺序，isLocalDirty 用 local 顺序）
- 统一为 `mergeBuddyStates`（local 顺序优先），删除 60 行内联逻辑
- 新增 `mergeDreamFunds` 函数（可独立测试）
- buddy-sync.ts 从 913 行 → 864 行

### 测试统计

| 测试类型 | 文件数 | 测试数 |
|---------|--------|--------|
| 单元测试 (vitest) | 60 | 1519 |
| 架构守卫测试 | 1 | 20 |
| 事件契约测试 | 1 | 19 |
| E2E 测试 (Playwright) | 3 | 3 |
| **总计** | **65** | **1561** |

### 文档体系

| 文件 | 用途 | 更新频率 |
|------|------|----------|
| `.memory/reality-status.md` | 现实状态文档 — 完成度/技术债/事实源 | 每周 |
| `.memory/exit-criteria.md` | 退出条件清单 — 每模块完成标准 | 每轮迭代 |
| `.memory/architecture-optimization-plan.md` | 优化计划 — 6 条方向 + 优先级 | 季度 |

### 下一轮优化方向

1. **buddy-sync.ts 继续拆分** — 提取 `_doPull` 到独立函数（864→<800 行）
2. **profile-tab.tsx 拆分** — 提取 EmailConnectionSection + PremiumSection（901→<800 行）
3. **Playwright E2E CI 集成** — GitHub Actions 自动运行
4. **letta-agent-manager.ts 拆分** — 提取 per-user agent 管理逻辑（879→<800 行）

### 守卫清单（已部署的修复，不能回退）

团队所有成员注意：以下修复已有架构守卫测试保护，修改时不能回退：

| 修复 | 守卫测试 | 文件 |
|------|---------|------|
| P0-1: buy 按钮不弹存款对话框 | `handleChooseToBuy passes isBuyPath=true` | architecture-guards.test.ts |
| P0-A: 事件结构不崩溃 | `assignClientIllustration reads event.chapterIndex` | architecture-guards.test.ts + event-contracts.test.ts |
| P0-B: gacha count 不在错误时消耗 | `player.start returns Promise<boolean>` | architecture-guards.test.ts |
| Player 卡住修复 | `activeSessionHasPendingChoice checks session.status` | architecture-guards.test.ts |
| Gacha 限额文案 | `gachaLimitReached does not say "1 universe"` | architecture-guards.test.ts |
| Deposit fill history | `deposit route creates health_event with deposit_api` | architecture-guards.test.ts |
| buddy-sync 合并统一 | `buddy-sync.ts does not contain inline merge` | architecture-guards.test.ts |
| service_role 隔离 | `no client component contains service_role` | architecture-guards.test.ts |
| 文件大小 | `chat-tab <800, butterfly-tab <850, buddy-sync <900` | architecture-guards.test.ts |

**违反守卫 = PR 不合并。**
