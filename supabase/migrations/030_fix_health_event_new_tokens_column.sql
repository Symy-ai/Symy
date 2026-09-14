-- ============================================================
-- 030: Fix create_health_event_atomic — INSERT 引用了不存在的 new_tokens 列
-- ============================================================
-- 问题：migration 012 的 RPC 函数在 INSERT health_events 时用了 new_tokens 列：
--   INSERT INTO public.health_events (..., new_vitality, new_tokens) VALUES (...)
-- 但 006_health_events.sql 定义 health_events 表时没有 new_tokens 列：
--   id, user_id, event_type, vitality_change, new_vitality, token_change,
--   trigger_source, trigger_id, description, metadata, created_at
-- → RPC 抛 "column new_tokens of relation health_events does not exist"
-- → 被 EXCEPTION 块捕获，返回 {success: false}
-- → createHealthEvent 检测 success=false 直接返回失败，不走 legacy fallback
-- → MCP handlers 的 createHealthEvent 调用全部静默失败
-- → Health Log 永远为空
--
-- 修复：去掉 INSERT 里的 new_tokens 列（变量保留，UPDATE buddy_state 还要用）
-- 同时修复 RETURN 里的 new_tokens（改成 new_vitality 之外不再返回 new_tokens）
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_health_event_atomic(
  p_user_id         UUID,
  p_event_type      TEXT,
  p_vitality_change INTEGER,
  p_token_change    INTEGER,
  p_trigger_source  TEXT,
  p_trigger_id      TEXT,
  p_description     TEXT,
  p_metadata        JSONB DEFAULT '{}',
  p_refund_amount   NUMERIC DEFAULT 0,
  p_new_badges      TEXT[] DEFAULT '{}',
  p_dream_fund_id   TEXT DEFAULT 'df-1'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  bs            RECORD;
  new_vitality  INTEGER;
  new_tokens    INTEGER;
  new_health    TEXT;
  event_id      UUID;
  updated_dream_funds JSONB;
  fund_elem     JSONB;
  all_badges    TEXT[];
  badge_item    TEXT;
  badges_jsonb  JSONB;
  default_dream_funds CONSTANT JSONB := '[{"id":"df-1","name":"Credit Card Payoff","target":2000,"current":0,"emoji":"💳"},{"id":"df-2","name":"Iceland Trip","target":5000,"current":0,"emoji":"🏔️"}]'::jsonb;
  current_dream_funds JSONB;
  target_fund_id TEXT;
BEGIN
  -- Default fund target for refund_boost
  target_fund_id := COALESCE(p_dream_fund_id, 'df-1');

  -- ============================================================
  -- 1. Lock buddy_state row
  -- ============================================================
  SELECT * INTO bs
  FROM public.buddy_state
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.buddy_state (user_id, vitality, tokens, health, level, xp, xp_to_next, streak, dream_funds, badges, total_saved, challenges_completed, last_drain_at, updated_at)
    VALUES (
      p_user_id,
      72, 156, 'healthy', 1, 0, 100, 0,
      default_dream_funds,
      '[]'::jsonb, 0, 0, now(), now()
    )
    RETURNING * INTO bs;
  END IF;

  -- BUG-186 fix: if dream_funds is empty, seed defaults
  IF COALESCE(bs.dream_funds, '[]'::jsonb) = '[]'::jsonb THEN
    UPDATE public.buddy_state
    SET dream_funds = default_dream_funds, updated_at = now()
    WHERE user_id = p_user_id;
    bs.dream_funds := default_dream_funds;
  END IF;

  -- ============================================================
  -- 2. Calculate new vitality and tokens
  -- ============================================================
  new_vitality := GREATEST(0, LEAST(100, COALESCE(bs.vitality, 72) + p_vitality_change));
  new_tokens := GREATEST(0, COALESCE(bs.tokens, 156) + p_token_change);

  IF new_vitality <= 0 THEN new_health := 'dormant';
  ELSIF new_vitality <= 20 THEN new_health := 'critical';
  ELSIF new_vitality <= 45 THEN new_health := 'weak';
  ELSIF new_vitality <= 75 THEN new_health := 'healthy';
  ELSE new_health := 'thriving';
  END IF;

  -- ============================================================
  -- 3. Update buddy_state
  -- ============================================================
  UPDATE public.buddy_state
  SET
    vitality   = new_vitality,
    tokens     = new_tokens,
    health     = new_health,
    updated_at = now()
  WHERE user_id = p_user_id;

  -- ============================================================
  -- 4. Refund-boost: also update total_saved and dream_funds
  -- ============================================================
  IF p_event_type = 'refund_boost' AND p_refund_amount > 0 THEN
    UPDATE public.buddy_state
    SET total_saved = COALESCE(total_saved, 0) + p_refund_amount
    WHERE user_id = p_user_id;

    -- Re-read dream_funds
    SELECT dream_funds INTO current_dream_funds
    FROM public.buddy_state
    WHERE user_id = p_user_id;

    current_dream_funds := CASE
      WHEN COALESCE(current_dream_funds, '[]'::jsonb) = '[]'::jsonb
      THEN default_dream_funds
      ELSE current_dream_funds
    END;

    SELECT INTO updated_dream_funds
      COALESCE(
        (SELECT jsonb_agg(
          CASE WHEN elem->>'id' = target_fund_id
            THEN elem || jsonb_build_object(
              'current',
              LEAST(
                COALESCE((elem->>'target')::numeric, 0),
                COALESCE((elem->>'current')::numeric, 0) + p_refund_amount
              )
            )
            ELSE elem
          END
        )
        FROM jsonb_array_elements(current_dream_funds) AS arr(elem)),
        current_dream_funds
      );

    UPDATE public.buddy_state
    SET dream_funds = updated_dream_funds
    WHERE user_id = p_user_id;
  END IF;

  -- ============================================================
  -- 5. Badge awards
  -- ============================================================
  IF array_length(p_new_badges, 1) > 0 THEN
    SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(bs.badges, '[]'::jsonb)))
    INTO all_badges;

    FOREACH badge_item IN ARRAY p_new_badges LOOP
      IF NOT (badge_item = ANY(all_badges)) THEN
        all_badges := array_append(all_badges, badge_item);
      END IF;
    END LOOP;

    SELECT jsonb_agg(b) INTO badges_jsonb FROM unnest(all_badges) AS b;
    badges_jsonb := COALESCE(badges_jsonb, '[]'::jsonb);

    UPDATE public.buddy_state
    SET badges = badges_jsonb, updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  -- ============================================================
  -- 6. Create health_event record
  -- 🔧 P0 fix (migration 030): 去掉 new_tokens 列 — health_events 表没有这列
  -- 之前: INSERT (..., new_vitality, new_tokens) → 报错 column does not exist
  -- 现在: INSERT (..., new_vitality) — 不存 new_tokens（表里也没这列）
  -- ============================================================
  INSERT INTO public.health_events (user_id, event_type, vitality_change, token_change, trigger_source, trigger_id, description, metadata, new_vitality)
  VALUES (
    p_user_id, p_event_type, p_vitality_change, p_token_change,
    p_trigger_source, p_trigger_id, p_description, p_metadata,
    new_vitality
  )
  RETURNING id INTO event_id;

  -- ============================================================
  -- 7. Return result
  -- 🔧 P0 fix: 去掉 new_tokens 字段（表里没有，返回也没意义）
  -- ============================================================
  RETURN jsonb_build_object(
    'success',        true,
    'event_id',       event_id,
    'vitality_change', p_vitality_change,
    'new_vitality',   new_vitality,
    'token_change',   p_token_change,
    'new_tokens',     new_tokens  -- 仍返回计算值（用于响应），但不写入 health_events
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- Permissions
GRANT EXECUTE ON FUNCTION public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT) FROM anon;

COMMENT ON FUNCTION public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT) IS
  'P0 fix (migration 030): remove new_tokens from INSERT — health_events table has no such column';
