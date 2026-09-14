-- Migration 121: push_subscriptions table for Web Push notifications
--
-- 🔧 2026-07-20: 营销报告 P2 #16 — 推送通知功能
--
-- 存储用户的 Web Push 订阅信息 (endpoint + keys)
-- 一个用户可以有多个订阅 (不同设备/浏览器)

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  -- 用户偏好 (JSONB, 可扩展)
  -- {
  --   "missYou": true,        -- 3 天未登录召回
  --   "dreamFund": true,      -- Dream Fund 进度
  --   "challenge": true,      -- 社区挑战
  --   "frequency": "daily"    -- daily | weekly | off
  -- }
  preferences JSONB NOT NULL DEFAULT '{"missYou": true, "dreamFund": true, "challenge": true, "frequency": "daily"}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 一个用户在同一 endpoint 上只能有一个订阅
  UNIQUE(user_id, endpoint)
);

-- 索引: 按用户查询所有订阅
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);

-- 索引: 按 endpoint 查询 (取消订阅时用)
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON public.push_subscriptions(endpoint);

-- RLS: 用户只能管理自己的订阅
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own push subscriptions"
  ON public.push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own push subscriptions"
  ON public.push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own push subscriptions"
  ON public.push_subscriptions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own push subscriptions"
  ON public.push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

-- updated_at 触发器函数 (与其他 migration 一致: 每个表有自己的触发器函数)
CREATE OR REPLACE FUNCTION public.update_push_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- updated_at 触发器
CREATE TRIGGER handle_push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_push_subscriptions_updated_at();
