-- ============================================================
-- 035: Add mode column to chat_messages for challenge/normal separation
-- ============================================================
-- 问题: 挑战对话和普通对话共用 chat_messages 表, 历史消息混在一起
--
-- 修复: 加 mode 列 ('normal' | 'challenge'), 前端按 mode 过滤显示
--   - normal: 普通聊天 (默认)
--   - challenge: 挑战模式对话
--
-- 旧消息默认 mode='normal', 不影响现有数据
-- ============================================================

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'normal'
  CHECK (mode IN ('normal', 'challenge'));

CREATE INDEX IF NOT EXISTS chat_messages_user_mode_created_idx
  ON public.chat_messages (user_id, mode, created_at DESC);

COMMENT ON COLUMN public.chat_messages.mode IS 'normal = regular chat, challenge = challenge mode conversation';
