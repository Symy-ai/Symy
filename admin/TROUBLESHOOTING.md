# 后台管理系统 — 故障排查与 Vercel 部署问题

## 一、Vercel 部署失败（pre-existing，2026-07-15）

### 现象
- Vercel 预览 `https://we-me-mvp-git-main-spark-huang-s-projects.vercel.app/` 仍是旧版本
- `/admin/*` 路由返回 404（新路由未部署）
- GitHub commit status 显示 "Deployment failed"

### 排查过程
1. **确认是 pre-existing**：查 GitHub API，ADMIN-1 之前的多个 commit（6233ab99 / 7519edef / ca8fd454）Vercel 部署均 failure。**不是后台系统代码导致**
2. **本地 build 成功**：沙盒 `npm run build` 全部路由编译通过（含 10 个 /admin/* 路由），无 TS 错误 / Module not found
3. **后端 API 在线**：Vercel 旧版本的 `/api/admin/audit` / `/letta` / `/cultivation` 均返回 200（ADMIN_API_KEY 鉴权有效）
4. **尝试修复（均未成功）**：
   - cron 任务：`NODE_OPTIONS=--max-old-space-size=4096`（f6c3edfe）
   - ADMIN-1：降低到 3072 + .nvmrc Node 22（b339d9c0）
   - cron 任务：vercel.json buildCommand 直接设 NODE_OPTIONS（7d33b13e）

### 可能根因（需用户在 Vercel Dashboard 确认）
- **Build OOM**：Vercel Hobby 套餐 build 内存 4GB，Next 16 + Turbopack build 可能超限
  → 解决：升级 Vercel Pro（8GB）或优化 build 内存
- **Node 版本不兼容**：本地 Node 24，Vercel 默认 Node 20，某些 native 模块（sharp）可能不兼容
  → 解决：.nvmrc 已设 Node 22，确认 Vercel 读取
- **依赖安装失败**：package-lock.json 可能与 Vercel npm 版本不兼容
  → 解决：在 Vercel Dashboard 查看 install 阶段日志
- **环境变量缺失**：build 时读取的环境变量（如 NEXT_PUBLIC_SUPABASE_URL）可能缺失
  → 解决：确认 Vercel 项目环境变量齐全

### 用户操作建议
1. 登录 Vercel Dashboard → spark-huang/we-me-mvp 项目
2. 查看最新 deployment 的 Build Logs
3. 定位失败阶段（install / build / deployment）
4. 根据错误信息修复（常见：升级套餐 / 加环境变量 / 修依赖）
5. 修复后 Vercel 自动重新部署，/admin 系统即可访问

## 二、本地开发问题

### dev server 编译崩溃（OOM）
**现象**：沙盒 4GB 内存，`bun run dev` 编译多个 admin 路由时 next-server 进程被 OOM kill。

**解决**：
- 清理 `.next` 缓存后重启：`rm -rf .next && bun run dev`
- 逐个访问路由（避免同时编译多个）
- 本地 `.env.local` 至少配置 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `ADMIN_API_KEY`

### agent-browser 无法访问 localhost
**现象**：`agent-browser open http://localhost:3000/admin/login` → ERR_CONNECTION_REFUSED

**原因**：agent-browser 的 chromium 在云端运行，无法访问沙盒 localhost。

**解决**：需通过公网 URL 访问（如 Vercel 预览）。Vercel 部署修复后可用 agent-browser 自测。

## 三、后台系统常见问题

### 登录后立即跳回登录页
**原因**：API 验证失败（key 无效）或 401 自动登出。
**解决**：确认 ADMIN_API_KEY 与 Vercel 环境变量一致。

### Dashboard 卡片显示「未知」
**原因**：对应 admin API 返回失败（环境变量缺失）。
**解决**：确认 LETTA_API_KEY / MCP_API_SECRET / SUPABASE_SERVICE_ROLE_KEY 已配置。

### Letta 操作返回 500
**原因**：LETTA_API_KEY 缺失或 Letta API 不可达。
**解决**：检查 Vercel 环境变量 + Letta 服务状态。

### 审计日志为空
**正常**：admin_audit_logs 表初始为空，有 admin 操作后才记录。

### Agent Pool 返回 401
**原因**：agent-pool API 用 `x-admin-api-key` header（非 Bearer）。前端已封装，正常情况不会 401。若 401 说明 key 无效。
