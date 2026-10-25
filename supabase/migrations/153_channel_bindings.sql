-- supabase/migrations/153_channel_bindings.sql

CREATE TABLE IF NOT EXISTS public.channel_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('telegram', 'wechat_mp', 'wechat_wecom')),
  platform_user_id TEXT NOT NULL,          -- TG from.id / 微信 openid（唯一身份键）
  platform_username TEXT,                  -- TG @username, 仅展示用, 永不回显渲染
  chat_ref TEXT NOT NULL,                  -- 回复目标
  locale TEXT NOT NULL DEFAULT 'zh' CHECK (locale IN ('zh', 'en')),
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, platform_user_id)      -- 一个平台身份只绑一个 user
);

CREATE INDEX IF NOT EXISTS idx_channel_bindings_user ON public.channel_bindings (user_id);

ALTER TABLE public.channel_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channel_bindings_select_own" ON public.channel_bindings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "channel_bindings_insert_own" ON public.channel_bindings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "channel_bindings_update_own" ON public.channel_bindings
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
-- MVP 不发 DELETE policy（解绑走服务端 admin 路径, 用户端无删除入口）

GRANT SELECT, INSERT, UPDATE ON public.channel_bindings TO authenticated;
