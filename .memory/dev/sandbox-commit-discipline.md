---
name: sandbox-commit-discipline
description: ⛔ 沙盒环境 commit 铁律 — 禁止提交本地垃圾文件 / 禁止 UUID commit message / commit 前必须 git pull + 检查 diff
type: rule
---

# 沙盒环境 Commit 铁律

> ⛔ **2026-07-11 教训**: 沙盒 AI 曾在一次 commit (`d8b7d021`, message `37a658c8-...`) 中
> 把 92 个文件 / 13240 行塞进仓库，其中包含 9 个重复 migration + 5 个不属于项目的孤立文件
> (SQLite db, Prisma schema, 未使用组件等)。**用户被迫手动清理** (commit `ba67dfaf`)。
>
> 这个教训**所有后续开发者/AI 会话都必须记住**，别让用户再擦屁股。

## 🔴 铁律 1: Commit 前必须检查 diff

**永远不要** `git add -A` 然后直接 commit。必须先检查：

```bash
git status --short          # 看有哪些文件变了
git diff --cached --stat    # 看暂存区有哪些文件
```

### 必须排除的文件类型（沙盒本地垃圾，不属于 WeAreAllMe）:

| 文件 | 原因 |
|------|------|
| `db/custom.db` | SQLite 数据库 — 项目用 Supabase，不用 SQLite |
| `prisma/schema.prisma` | Prisma schema — 项目用 Supabase，不用 Prisma |
| `src/lib/db.ts` | Prisma client — 项目用 Supabase |
| `src/hooks/use-toast.ts` | 沙盒模板的 toast hook — 项目有自己的 toast |
| `next-env.d.ts` | Next.js 自动生成 — 不该手动 commit |
| `next.config.ts.standalone` | Docker 配置 — Vercel 部署不需要 |
| `.next/` | 构建产物 |
| `node_modules/` | 依赖 |
| `screenshots/` | QA 截图 — 本地调试用 |
| `audit/` | 审计报告 — 本地生成 |
| `*.py` (根目录) | Python 脚本 — 项目是 TypeScript |
| `AI_*.md` / `SYMY_*.md` / `competitor_*.md` (根目录) | 研究报告 — 本地文档，不是代码 |

### 必须排除的 migration 陷阱:

**新建 migration 前必须检查最大编号**:
```bash
ls supabase/migrations/ | sort | tail -5   # 看当前最大编号
```

- ⛔ **禁止** 用已存在的编号 (如 051, 052, 054...)
- ⛔ **禁止** 用 `051_a_onboarding_merged.sql` 这种带后缀的"重复"编号
- ✅ 必须用 `最大编号+1` (如最大是 093，新建用 094)
- 详见 `architecture-debt-policy.md` 的 Migration 编号铁律

## 🔴 铁律 2: Commit message 必须有意义

**永远不要** 用 UUID / 空字符串 / "fix" / "update" 作为 commit message。

**正确格式** (遵循 Conventional Commits):
```
<type>(<scope>): <subject>

<body 说明具体改了什么>
```

- `feat(buddy): add daily needs tooltip`
- `fix(pm5): You saw count includes challenge_failed`
- `docs(worklog): Round 90 — health event log`
- `refactor(arch): migrate challenge/limit to withAuth`

⛔ **禁止的 message 示例**:
- `37a658c8-407a-4b4d-bb13-ad7dd831172a` (UUID — 工具默认值，AI 必须覆盖)
- `fix` / `update` / `test` (太模糊)
- 空白 / 只有标点

## 🔴 铁律 3: Commit 前必须 git pull

```bash
git pull --rebase origin main   # 先拉远程
# 如果有冲突，解决冲突
git push origin main             # 再推
```

**永远不要** `git push -f` (force push)。遇 reject 先 `git pull --rebase`。

## 🔴 铁律 4: 禁止 `git add -A` 一把梭

**必须** 只 add 你这次修改的文件:

```bash
# ✅ 正确: 逐个 add
git add src/components/buddy/daily-needs-section.tsx
git add src/i18n/messages/en.json src/i18n/messages/zh.json

# ⛔ 错误: 一把梭 (会把垃圾文件也加进去)
git add -A
```

如果确实需要 `git add -A`，**必须**先 `.gitignore` 排除垃圾文件，再 `git status` 确认暂存区只有项目文件。

## 🔴 铁律 5: .gitignore 必须维护

每次发现新的垃圾文件类型，**立即**加到 `.gitignore`:

```bash
# 已有的排除项 (持续维护)
src/components/ui/          # 沙盒模板的 shadcn 组件
src/hooks/use-toast.ts      # 沙盒模板
src/lib/db.ts               # 沙盒模板 Prisma
next-env.d.ts               # Next.js 自动生成
screenshots/                # QA 截图
audit/                      # 审计报告
db/                         # SQLite (项目用 Supabase)
prisma/                     # Prisma (项目用 Supabase)
```

## 🔴 铁律 6: Commit 后自检

每次 commit + push 后，**必须**:

```bash
git log --oneline -3                         # 确认 message 正确
git show HEAD --stat | head -20              # 确认只改了预期文件
git show HEAD --stat | grep -E "db/|prisma/|use-toast|lib/db.ts|next-env"  # 应该为空
```

如果自检发现垃圾文件，**立即** `git rm --cached <file>` + 补一个 fix commit，**不要等用户发现**。

## 📋 Commit Checklist (每次 commit 前过一遍)

- [ ] `git pull --rebase origin main` 已执行
- [ ] `git status --short` 检查了变更文件
- [ ] 没有 `db/` / `prisma/` / `use-toast.ts` / `lib/db.ts` / `next-env.d.ts` 在暂存区
- [ ] 没有重复编号的 migration 文件
- [ ] 没有 `screenshots/` / `audit/` / `.next/` 在暂存区
- [ ] commit message 是 `type(scope): subject` 格式 (非 UUID)
- [ ] `git diff --cached --stat` 确认只改了预期文件
- [ ] commit 后 `git show HEAD --stat` 自检通过

## 🚨 违反后果

用户已经因为这个问题**手动清理过一次** (commit `ba67dfaf`, 删了 14 个文件)。
**如果再犯，用户会失去信任，可能禁止 AI 直接 push 到 main。**

所有后续 AI 会话: 读到这个文件，**在第一次 commit 前**必须确认你理解了上述铁律。
