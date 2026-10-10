# Migration 待部署清单（owner 决策用）

> 2026-10-01/02 烧token循环产出。全部**未执行**——按你之前的决策面规则（涉DB/涉钱），留表待批。

## 需要部署的（按序号顺序执行即可）

### 145_active_challenges_history_index.sql
- **目的**：`active_challenges(user_id, status, completed_at DESC)` 复合索引
- **为什么**：历史/统计查询走 `user_id+status` 过滤（RLS 隐式 user_id 过滤也在内），现无索引=顺序扫。用户量增长后线性变慢。
- **影响**：`CREATE INDEX IF NOT EXISTS`（非 CONCURRENTLY——Supabase migration runner 事务内）。active_challenges 表当前规模下锁表秒级；表若已百万行级建议控制台手动 `CREATE INDEX CONCURRENTLY` 同名语句替代。
- **回滚**：`DROP INDEX IF EXISTS public.idx_active_challenges_user_status_completed;`

### 146_email_receipts_user_status_received_index.sql
- **目的**：`email_receipts(user_id, status, received_at DESC)` 复合索引
- **为什么**：收件箱高频查询（每次进 email 面）同模式全表扫。
- **影响/回滚**：同 145（索引名 `idx_email_receipts_user_status_received`）。

### 149_increment_resonates_search_path.sql（2026-10-11 R477，v13-C 产出）
- **目的**：`increment_resonates` (136) SECURITY DEFINER 补 `SET search_path = ''`（CVE-2024-7348 防御）
- **为什么**：无 search_path 的 SECURITY DEFINER 函数内非限定引用可被恶意 schema 劫持。v13-C 审计确认这是唯一漏网（其余 RPC 终态全带）。
- **影响**：函数体与 136 逐行相同仅加安全设置；`REVOKE ... FROM anon` 一并补上（136 只 GRANT authenticated 未显式 REVOKE anon）。幂等。
- **回滚**：无独立回滚（逻辑不变仅加固）。

### 148_rls_policy_guard.sql（2026-10-11 更新）
- **目的**：①backfill 修复 4 处 UPDATE policy 缺 WITH CHECK（10-01 审计漏检勘误，见 doc/rls-audit-findings.md；avatars 已由 114 修复不在集内）②DB 级守卫——任何 UPDATE 策略缺 `WITH CHECK` 时部署直接失败
- **为什么**：USING-only UPDATE policy = 用户可改 user_id 转移行所有权（提权模式）。守卫已扩 storage schema。
- **影响**：`ALTER POLICY ... WITH CHECK` 五条（幂等语义同 CREATE，policy 已存在）+ DO 守卫块。若线上 policy 名与本文件不一致会报错——报错即说明线上结构漂移，须先核对。
- **回滚**：`ALTER POLICY ... WITH CHECK` 无独立回滚（可 `ALTER POLICY ... WITH CHECK (true)` 放开，不建议）。
- **影响**：无 DDL 变更（只读 pg_policies 的 DO 块断言），零风险。
- **回滚**：不需要（无状态变更）。

## 部署顺序与命令

```bash
supabase db push   # 或 Vercel/Supabase 控制台按 145→146→148 顺序执行
```

三者无相互依赖，顺序仅按序号惯例。145/146 若担心锁表，在 Supabase SQL 编辑器跑：
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_active_challenges_user_status_completed ON public.active_challenges (user_id, status, completed_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_receipts_user_status_received ON public.email_receipts (user_id, status, received_at DESC);
```
（CONCURRENTLY 不能在事务里——控制台直接跑没问题；跑完后 migration 145/146 的 IF NOT EXISTS 会自动跳过。）

## 无需动作

- **RLS 审计存档**：已移至 `doc/rls-audit-findings.md`（原 147 纯注释无 DDL，避免 runner 空跑）。列级策略候选 3 处（email_connections.tokens / profiles.email / profiles.letta_agent_id）属产品决策，见该文档。

## 上线后验证

部署 145/146 后可跑（任意 SQL 客户端）：
```sql
EXPLAIN ANALYZE SELECT * FROM active_challenges WHERE user_id = '<某uuid>' AND status = 'passed' ORDER BY completed_at DESC LIMIT 50;
```
应出现 `Index Scan using idx_active_challenges_user_status_completed`。

## Vercel env 空值（2026-10-11 R506 审计发现，非迁移）

### DATABASE_URL / PAYLOAD_SECRET（Payload CMS 面）
- **现状**：Vercel production/preview 均**空值**。Payload postgresAdapter `connectionString: process.env.DATABASE_URL || ''`。
- **影响**：/cms 线上返回登录壳（200），但任何实际 CMS 操作（登录验证/posts 读写）都连不上 DB——Payload 面是僵尸壳。R466 已修 LETTA/SERVICE_ROLE 空值，这 2 个漏网。
- **修法**（owner）：Vercel → Settings → Environment Variables 补：
  - DATABASE_URL = Supabase pooler 连接串（`postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`，transaction mode）
  - PAYLOAD_SECRET = 随机 32+ 字符
- **注意**：payload.config.ts `push: false`——Payload 不会自动建表。配好 DATABASE_URL 后首启须跑 `npx payload migrate:create` 系列或 `push: true` 一次性建 payload 表系（users/posts 两 collection 的表在 DB 里不存在）。

### 其余 11 个真空值（2026-10-11 R507 全扫分类，owner 知悉即可）
- **非缺口（代码 fallback 语义吸收）×6**：ADMIN_ALLOWED_ACTORS（白名单空=actor 可选+warn）、EMBEDDING_API_BASE/API_KEY/BASE_URL/MODEL（admin-settings required:false → degraded 状态显示）、AGNES_API_KEY（EMBEDDING_API_KEY 的 alternate 链）、BUTTERFLY_ILLUSTRATION_ENABLED + COMMUNITY_STATS_MULTIPLIER（feature-flags 有默认值）。
- **fail-closed 功能锁 ×3（线上 admin/cron 面锁死，非漏洞）**：ADMIN_API_KEY 空=verifyAdminAuth 恒拒+error log（admin API 全锁）；ADMIN_EMAILS 空=邮箱白名单恒空（create-weekly-challenges-auth 恒拒）；CRON_SECRET 空=cron 路由恒拒。若需要启用对应功能面，在 Vercel env 补值即可。
- DATABASE_URL 见上节（Payload 面）。
