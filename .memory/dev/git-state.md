---
name: git-state
description: Git当前HEAD/分支职责/工作树状态/备份分支/推送备忘，易变，每次推送后更新
type: state
---

# Git 当前状态

> ⚠️ **易变文件** — 每次推送后更新此处。
> 工作流**原则**（永远在 main / 绝不 force push / 推送前确认 / 分支职责定义）见 [[critical]] §1，不在本文件重复。
> 路径：本地工作副本 `d:\src\WeAreAllMe`（Windows）；线上/sandbox 可能仍是 `/home/z/my-project`（Linux）。

## 分支职责（稳定，详见 [[critical]] §1）
- `main` — 日常开发分支（AI + 用户共用，Vercel Preview 自动部署）
- `release` — 生产环境（仅用户明确要求时从 main 同步，Vercel Production）
- `dev` — 已废弃，仅历史备份，不再日常推送

## 当前 HEAD（2026-08-04 — Round 3 架构优化已 push）
- 本地 `main`：HEAD `e10125e`（refactor: Round 3架构优化 — 删dead code+加守卫+更新记忆文档），已 push origin/main。
  - 删除 10 个 dead code 文件（2,225 行，0 引用），新增 20 个"禁止复活"守卫测试（135 total）。
  - 同步 reality-status.md / exit-criteria.md / architecture-debt-policy.md 到 React Query 迁移后的现实。
  - 详见 [[architecture-optimization-round-3]]。
- `origin/release`：`6dc7fd4`（落后 main，待决定同步）。
- 网络备注（历史）：2026-07-22 Windows 沙盒曾遇 GFW 阻断 github.com/vercel.app；当前 WSL 环境正常。

