-- 083: 扩展 health_events.trigger_source CHECK 约束 — 增加 'deposit_api'
--
-- 🔧 P2 fix (Fill history inconsistency): 用户手动存入 Dream Fund 时, deposit API 创建
--   challenge_reward health_event 记录, trigger_source = 'deposit_api'。
--   旧 CHECK 约束 (migration 006) 只允许 8 种 trigger_source, 不含 'deposit_api' →
--   INSERT 失败 with check_violation (SQLSTATE 23514) → Fill history 仍显示 "No fills yet"
--   但基金余额已增加 → 数据不一致。
--
-- 修复: DROP 旧约束 + ADD 新约束 (含 'deposit_api')。
-- 注意: ALTER CONSTRAINT 不能直接修改 CHECK 列表, 必须 DROP + ADD。

ALTER TABLE public.health_events DROP CONSTRAINT IF EXISTS health_events_trigger_source_check;

ALTER TABLE public.health_events ADD CONSTRAINT health_events_trigger_source_check CHECK (trigger_source IN (
  'email_receipt',
  'email_refund',
  'email_ignore',
  'chat_mcp',
  'passive_daily',
  'token_drain',
  'revive_deposit',
  'manual',
  'deposit_api'
));
