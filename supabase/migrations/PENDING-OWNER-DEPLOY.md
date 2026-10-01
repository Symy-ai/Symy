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

### 148_rls_policy_guard.sql
- **目的**：DB 级守卫——任何 UPDATE 策略缺 `WITH CHECK` 时部署直接失败（铁律「UPDATE必带WITH CHECK」的机器锁）
- **为什么**：RLS 审计确认当前零违规；此守卫防未来 migration 引入违规策略。
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
