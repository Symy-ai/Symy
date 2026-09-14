# .memory 索引 — 恢复上下文的唯一入口

> 新会话/新任务先读本文件，按需点入对应文件。每个文件一行钩子。
> 凭证在 `secrets.md`(gitignored)，需时单独读，勿在其它文件记录。

## 📁 目录结构
- [dev/](dev/MEMORY.md) — 开发记忆：铁律 / 架构 / 现实状态 / 退出条件 / 优化计划

## 🔴 核心必读（开新任务前过一遍）
- [dev/critical.md](dev/critical.md) — ⛔ 铁律：Git 工作流原则 / 安全规则 / 技术栈 / Tab 结构 / Bug 历史教训。每次开始工作必读
- [dev/sandbox-commit-discipline.md](dev/sandbox-commit-discipline.md) — ⛔ **沙盒 commit 铁律**：禁止提交垃圾文件 / 禁止 UUID message / commit 前 git pull + 检查 diff / 禁止 git add -A。**2026-07-11 教训，所有 AI 会话必读，别让用户擦屁股**
- [dev/architecture-debt-policy.md](dev/architecture-debt-policy.md) — ⛔ 架构债管理规范：文件行数限制 / Hooks 声明顺序 / Fetch 竞态防护 / 模块级状态重置 / 不新增 as never。**开发人员必读，违反 = PR 不批准**
- [dev/reality-status.md](dev/reality-status.md) — 🔧 **现实状态文档**：整体完成度 / 非完成态模块 / 技术债 / 事实源映射 / 守卫清单。**每周更新，写现实不写理想**
- [dev/exit-criteria.md](dev/exit-criteria.md) — 🔧 **退出条件清单**：每模块的"真正完成"标准。每轮迭代更新
- [dev/architecture-optimization-plan.md](dev/architecture-optimization-plan.md) — 🔧 **架构优化计划**：基于《真正难的不是做一个 AI Demo》的 6 条优化方向 + 执行优先级
- [dev/api-design-principles.md](dev/api-design-principles.md) — ⚠️ AI 工具接口设计原则：最小决策 / 参数校验自动修正 / 幂等性 / 状态外置。新增/修改 MCP 工具必读
- [dev/git-state.md](dev/git-state.md) — Git 当前 HEAD / 分支职责 / 工作树状态 / 推送备忘（易变，每次推送后更新）
- [dev/project-context.md](dev/project-context.md) — 项目背景 / 共生养成机制 / 架构详解 / 数据库迁移表 / Google OAuth 配置
- [dev/feature-graph.md](dev/feature-graph.md) — 功能完成状态 / 项目里程碑 / 已知限制 / 蝴蝶效应版本迭代 / 仓库瘦身

## 📂 按需查阅
- [dev/arch-optimization-round-2.md](dev/arch-optimization-round-2.md) — 🔧 **架构优化 Round 2 总结**：Playwright E2E + chat-tab 拆分 + 事件契约 + buddy-sync 统一（2026-07-08）
- [dev/architecture-optimization-round-3.md](dev/architecture-optimization-round-3.md) — 🔧 **架构优化 Round 3**：全景扫描 + Lime 6 闭环评估 + 删除 3377 行 dead code 方案（2026-08-04）
- [dev/butterfly-xstate-rewrite.md](dev/butterfly-xstate-rewrite.md) — use-butterfly-session XState 架构（✅ 完成 2026-06-29，machine 单一源 reference）
- [dev/user-requests.md](dev/user-requests.md) — 待办 Backlog / 历史任务记录 / 用户关键约束
- [dev/api-routes.md](dev/api-routes.md) — API 路由速查 / 关键文件路径 / LLM 三级降级 / SSE 事件类型
- [dev/architecture-quick-reference.md](dev/architecture-quick-reference.md) — 架构速查：文件→职责映射
- [dev/ref-lime-long-iteration.md](dev/ref-lime-long-iteration.md) — 参考文章：Lime 项目7个月192版本迭代感悟
- [marketing/pitch-deck.md](marketing/pitch-deck.md) — 投资人路演 PPT v9 完整记忆（8 页 VC 合伙人视角）
- [marketing/investor-qa.md](marketing/investor-qa.md) — 投资人 Q&A 已确认答案
- [marketing/miracleplus-application.md](marketing/miracleplus-application.md) — 奇绩创谈 BP / 竞品分析 / Why Now / 决策记录
- [marketing/pitch-philosophy-translation.md](marketing/pitch-philosophy-translation.md) — 阳明心学→投资人语言翻译对照表

## 🔐 敏感（gitignored）
- `secrets.md` — Supabase / GitHub PAT / Letta / IMAP / ADMIN_API_KEY 等凭证；不进版本控制，本地独立维护

---

**维护约定**：每个事实只存一处（SSOT），他处用 `[[文件名]]` 指针；易变信息（Git HEAD 等）只进 git-state.md；流水账（git log / worklog 已有的）不抄进记忆。
