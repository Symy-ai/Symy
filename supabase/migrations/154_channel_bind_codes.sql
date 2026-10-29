-- T11 绑定码：网页账号 ↔ 渠道身份一次性迁移

CREATE TABLE IF NOT EXISTS public.channel_bind_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL CHECK (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  platform TEXT NOT NULL CHECK (platform IN ('telegram')),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_bind_codes_active_user
  ON public.channel_bind_codes (user_id) WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_channel_bind_codes_code
  ON public.channel_bind_codes (code, platform) WHERE consumed_at IS NULL;

ALTER TABLE public.channel_bind_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channel_bind_codes_select_own" ON public.channel_bind_codes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- INSERT/UPDATE 仅 service role；无用户面写入授权。

CREATE OR REPLACE FUNCTION public.claim_channel_binding(
  p_code text,
  p_platform text,
  p_platform_user_id text,
  p_chat_ref text,
  p_locale text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_user uuid;
  v_binding channel_bindings%ROWTYPE;
  v_shadow_user uuid;
BEGIN
  IF p_locale NOT IN ('zh', 'en') THEN
    RAISE EXCEPTION 'invalid locale';
  END IF;

  SELECT c.user_id INTO v_target_user
  FROM public.channel_bind_codes c
  WHERE c.code = p_code
    AND c.platform = p_platform
    AND c.consumed_at IS NULL
    AND c.expires_at > now()
  ORDER BY c.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_target_user IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT b.* INTO v_binding
  FROM public.channel_bindings b
  WHERE b.platform = p_platform AND b.platform_user_id = p_platform_user_id
  FOR UPDATE;

  IF FOUND THEN
    v_shadow_user := CASE WHEN v_binding.user_id <> v_target_user THEN v_binding.user_id ELSE NULL END;
    UPDATE public.channel_bindings
    SET user_id = v_target_user, chat_ref = p_chat_ref, last_seen_at = now()
    WHERE id = v_binding.id;
  ELSE
    INSERT INTO public.channel_bindings (user_id, platform, platform_user_id, chat_ref, locale)
    VALUES (v_target_user, p_platform, p_platform_user_id, p_chat_ref, p_locale);
  END IF;

  UPDATE public.channel_bind_codes
  SET consumed_at = now()
  WHERE user_id = v_target_user AND consumed_at IS NULL;

  RETURN jsonb_build_object('ok', true, 'user_id', v_target_user, 'shadow_user_id', v_shadow_user);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_channel_binding(text, text, text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_channel_binding(text, text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.issue_channel_bind_code(
  p_user_id uuid,
  p_code text,
  p_platform text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.channel_bind_codes (user_id, code, platform, expires_at)
  VALUES (p_user_id, p_code, p_platform, now() + interval '5 minutes')
  ON CONFLICT (user_id) WHERE consumed_at IS NULL
  DO UPDATE SET code = excluded.code, platform = excluded.platform,
    expires_at = excluded.expires_at, consumed_at = NULL, created_at = now();
  RETURN p_code;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_channel_bind_code(uuid, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_channel_bind_code(uuid, text, text) TO service_role;
