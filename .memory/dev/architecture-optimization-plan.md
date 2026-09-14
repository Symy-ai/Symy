---
name: architecture-optimization-plan
description: 架构优化计划 — 基于《真正难的不是做一个 AI Demo》文章的 6 条优化方向
type: plan
---

# Symy 架构优化计划

> 来源：文章《真正难的不是做一个 AI Demo》（Lime 项目 7 个月 192 版本迭代感悟）
> 核心论点：长期 AI 项目最大的挑战不是"做功能"，而是"维护一个会持续演化的系统"。

## 文章 5 个闭环原则 → Symy 对照

| 原则 | Lime 做法 | Symy 现状 | 差距 |
|------|----------|----------|------|
| 文档写现实 | 有现实状态文档 | .memory/ 偏理想 | ⚠️ 缺 reality-status |
| 测试画边界 | 有迁移守卫 | 58 测试文件, 无架构守卫 | ❌ 缺守卫测试 |
| GUI 验证闭环 | Playwright + CDP | 手动浏览器 | ❌ 缺自动化 |
| 守卫保护方向 | 有 import 守卫 | 无 | ❌ 完全缺失 |
| 进度可判断 | 有退出条件 | 无 | ❌ 完全缺失 |

## 6 条优化方向

### 1. 建立"现实状态文档"（最高优先级）
- 新增 `.memory/reality-status.md` — 写现实状态，不写理想
- 内容：当前不是完成态的模块、已知技术债、下一刀先打哪里、事实源映射
- 每周更新

### 2. 添加架构守卫测试（防止 AI 走回头路）
- 新增 `src/lib/__tests__/architecture-guards.test.ts`
- 守卫：大文件行数限制、旧模式不能重新引入、service_role 不暴露客户端、事件结构一致性
- 每次提交自动运行

### 3. GUI 验证自动化（Playwright E2E）
- 分层：单测 (vitest) → 集成测试 → Playwright E2E → 截图对比
- 优先覆盖 P0 bug 回归（buy button、gacha crash、fill history）
- 未来迭代执行

### 4. 事件结构一致性守卫
- 针对 P0-A 类 bug（XState 事件结构不一致）
- 新增事件结构契约测试
- 未来迭代执行

### 5. 进度可判断 — 退出条件清单
- 新增 `.memory/exit-criteria.md`
- 每个功能模块列出退出条件（什么时候算真正完成）
- 每轮迭代更新

### 6. 持续收敛 — 事实源映射
- 每轮迭代回答："同一种能力，到底听谁的？"
- buddy state → buddy_state JSONB 是唯一事实源
- gacha count → buddy_state.gacha_pulls_count 是唯一事实源
- 插图 → 服务端 AI 是主路径，客户端 AI 是 fallback

## 执行优先级

1. **立即** — reality-status.md + exit-criteria.md（1 小时）
2. **本周** — 架构守卫测试 + buddy-sync 合并逻辑统一（3 小时）
3. **下周** — Playwright E2E 框架 + P0 回归测试（1 天）
4. **持续** — 每轮迭代更新现实状态文档 + 退出条件清单
