-- ============================================================
-- chat_messages: 聊天记录持久化
-- 每条消息独立存储，方便按用户加载历史、删除单条、清空全部
-- ============================================================

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  reasoning   TEXT,           -- Agent 内部推理（可选）
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引：按用户 + 时间查询（加载历史的核心查询）
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_time
  ON public.chat_messages (user_id, created_at ASC);

-- RLS：用户只能操作自己的消息
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_messages_select_own"
  ON public.chat_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "chat_messages_insert_own"
  ON public.chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "chat_messages_delete_own"
  ON public.chat_messages FOR DELETE
  USING (auth.uid() = user_id);

-- 不允许 UPDATE（聊天记录不可篡改）
-- 如果需要"编辑"功能，后续再加 policy
