-- Migration 122: push_notification_log — 记录已发送的推送通知 (避免重复推送)
--
-- 🔧 2026-07-20: 营销报告 P2 #16 — 推送通知功能 Phase 3 (Dream Fund 进度通知)
--
-- 用途:
-- - 记录每个用户已收到的推送通知类型 + 关联 ID
-- - 避免重复推送 (如: Dream Fund 80% 里程碑只推送一次)
-- - 可查询历史通知记录 (未来可用于 analytics)
--
-- 通知类型 (notification_type):
-- - 'miss_you' — 3 天未登录召回
-- - 'dream_fund_milestone' — Dream Fund 进度里程碑 (50%/80%/100%)
-- - 'challenge_reminder' — 社区挑战提醒 (Phase 4, 未实现)
--
-- 关联 ID (reference_id):
-- - miss_you: null
-- - dream_fund_milestone: dream_fund.id (哪个基金达到里程碑)
-- - challenge_reminder: challenge_id

CREATE TABLE IF NOT EXISTS public.push_notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('miss_you', 'dream_fund_milestone', 'challenge_reminder')),
  reference_id UUID, -- 关联的 dream_fund.id / challenge_id (miss_you 为 null)
  milestone TEXT, -- 里程碑值 (如 '50', '80', '100' for dream_fund_milestone)
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 同一用户 + 同一通知类型 + 同一 reference_id + 同一 milestone 只能有一条记录
  -- (避免重复推送: 如 Dream Fund 80% 里程碑只推送一次)
  UNIQUE(user_id, notification_type, reference_id, milestone)
);

-- 索引: 按用户查询通知历史
CREATE INDEX IF NOT EXISTS idx_push_notification_log_user_id ON public.push_notification_log(user_id);

-- 索引: 按通知类型查询 (cron job 用)
CREATE INDEX IF NOT EXISTS idx_push_notification_log_type ON public.push_notification_log(notification_type);

-- 索引: 按发送时间查询 (清理旧记录用)
CREATE INDEX IF NOT EXISTS idx_push_notification_log_sent_at ON public.push_notification_log(sent_at);

-- RLS: 用户只能查看自己的通知历史 (不能手动插入/删除, 只能由系统写入)
ALTER TABLE public.push_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notification log"
  ON public.push_notification_log FOR SELECT
  USING (auth.uid() = user_id);

-- 注意: INSERT/UPDATE/DELETE 不开放给用户, 只能由 service_role (后端) 操作
