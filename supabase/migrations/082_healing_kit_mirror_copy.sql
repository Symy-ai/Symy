-- ============================================================
-- 082_healing_kit_mirror_copy.sql — 更新 healing kit RPC 文案为镜子哲学
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 旧代码: 'Healing Kit used (+3 vitality, +3 tokens)' (工具哲学)
-- 新代码: 'Magic mirror cleared (+3 clarity, +3 tokens)' (镜子哲学)

-- 🔧 fix: PostgreSQL 不允许 CREATE OR REPLACE 改变返回类型, 必须先 DROP
-- 错误: ERROR 42P13: cannot change return type of existing function
-- 修复: 先 DROP FUNCTION 再 CREATE
-- 🔧 P0 fix: 保持 JSONB 返回格式 (与 077 一致), 不能改成 RETURNS TABLE — 前端期望 JSONB
DROP FUNCTION IF EXISTS use_healing_kit(UUID, TEXT);

-- 重建 use_healing_kit RPC — 基于 077 的 JSONB 版本, 只改 description 字符串
CREATE FUNCTION use_healing_kit(p_user_id UUID, p_timezone TEXT DEFAULT 'UTC')
RETURNS JSONB AS $$
DECLARE
  bs RECORD;
  today_date DATE;
  last_kit_local TIMESTAMPTZ;
  new_vitality INTEGER;
  new_tokens INTEGER;
  new_level INTEGER;
  new_xp INTEGER;
  new_xp_to_next INTEGER;
  new_version INTEGER;
  current_health TEXT;
BEGIN
  -- 用用户时区的日期 (防 UTC 边界问题)
  today_date := (CURRENT_TIMESTAMP AT TIME ZONE COALESCE(p_timezone, 'UTC'))::DATE;

  -- 锁定行 + 读取当前状态
  SELECT * INTO bs FROM buddy_state WHERE user_id = p_user_id FOR UPDATE;

  -- 检查今日是否已用
  IF bs.last_healing_kit_at IS NOT NULL THEN
    last_kit_local := bs.last_healing_kit_at AT TIME ZONE COALESCE(p_timezone, 'UTC');
    IF last_kit_local::DATE = today_date THEN
      -- 今日已用 — 返回当前状态 + already_used_today
      RETURN jsonb_build_object(
        'success', FALSE,
        'tokens', bs.tokens,
        'vitality', bs.vitality,
        'health', bs.health,
        'level', bs.level,
        'xp', bs.xp,
        'xp_to_next', bs.xp_to_next,
        'lastHealingKitAt', bs.last_healing_kit_at,
        'version', bs.version,
        'error', 'already_used_today'
      );
    END IF;
  END IF;

  -- 加 3 vitality (上限 100) + 3 tokens + 15 XP
  new_vitality := LEAST(bs.vitality + 3, 100);
  new_tokens := bs.tokens + 3;
  new_xp := bs.xp + 15;
  new_level := bs.level;
  new_xp_to_next := bs.xp_to_next;
  new_version := COALESCE(bs.version, 0) + 1;

  -- Level up check (每 100 XP 升一级)
  WHILE new_xp >= new_xp_to_next LOOP
    new_xp := new_xp - new_xp_to_next;
    new_level := new_level + 1;
    new_xp_to_next := new_level * 100;
  END LOOP;

  -- 计算 health
  IF new_vitality >= 80 THEN current_health := 'thriving';
  ELSIF new_vitality >= 50 THEN current_health := 'healthy';
  ELSIF new_vitality >= 25 THEN current_health := 'weak';
  ELSIF new_vitality > 0 THEN current_health := 'critical';
  ELSE current_health := 'dormant';
  END IF;

  -- 更新 buddy_state
  UPDATE buddy_state
    SET vitality = new_vitality,
        tokens = new_tokens,
        level = new_level,
        xp = new_xp,
        xp_to_next = new_xp_to_next,
        health = current_health,
        last_healing_kit_at = NOW(),
        version = new_version,
        updated_at = NOW()
    WHERE user_id = p_user_id;

  -- 🔧 镜子哲学 fix: 更新 description 为镜子文案
  INSERT INTO health_events (user_id, event_type, vitality_change, new_vitality, token_change, trigger_source, trigger_id, description, metadata)
  VALUES (p_user_id, 'manual_adjustment', 3, new_vitality, 3, 'revive_deposit', NULL,
    'Magic mirror cleared (+3 clarity, +3 tokens)',
    '{"source":"healing_kit"}'::jsonb);

  -- 返回成功 + 新状态
  RETURN jsonb_build_object(
    'success', TRUE,
    'tokens', new_tokens,
    'vitality', new_vitality,
    'health', current_health,
    'level', new_level,
    'xp', new_xp,
    'xp_to_next', new_xp_to_next,
    'lastHealingKitAt', NOW(),
    'version', new_version
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
