-- ============================================================
-- 096: 群体防御网络 — 初始社区挑战数据 + 每周自动创建函数
-- ============================================================

-- 1. 插入初始挑战 (本周)
DO $$
DECLARE
  week_start timestamptz := date_trunc('week', NOW());
BEGIN
  INSERT INTO community_challenges (title, title_key, description, platform, start_date, end_date, is_active)
  VALUES (
    '7天不买TikTok推荐',
    'defense.challenge.tiktok',
    '7天内不在TikTok Shop购买推荐商品',
    'tiktok_shop',
    week_start,
    week_start + INTERVAL '7 days',
    true
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO community_challenges (title, title_key, description, platform, start_date, end_date, is_active)
  VALUES (
    '7天不买直播间商品',
    'defense.challenge.livestream',
    '7天内不在任何直播间购买商品',
    'livestream',
    week_start,
    week_start + INTERVAL '7 days',
    true
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO community_challenges (title, title_key, description, platform, max_amount, start_date, end_date, is_active)
  VALUES (
    '7天不买超过$50的非必需品',
    'defense.challenge.budget50',
    '7天内不购买超过$50的非必需品',
    NULL,
    50.00,
    week_start,
    week_start + INTERVAL '7 days',
    true
  )
  ON CONFLICT DO NOTHING;
END $$;

-- 2. 每周自动创建函数
CREATE OR REPLACE FUNCTION create_weekly_challenges()
RETURNS void AS $$
DECLARE
  week_start timestamptz := date_trunc('week', NOW());
BEGIN
  INSERT INTO community_challenges (title, title_key, description, platform, start_date, end_date, is_active)
  VALUES (
    '7天不买TikTok推荐',
    'defense.challenge.tiktok',
    '7天内不在TikTok Shop购买推荐商品',
    'tiktok_shop',
    week_start,
    week_start + INTERVAL '7 days',
    true
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO community_challenges (title, title_key, description, platform, start_date, end_date, is_active)
  VALUES (
    '7天不买直播间商品',
    'defense.challenge.livestream',
    '7天内不在任何直播间购买商品',
    'livestream',
    week_start,
    week_start + INTERVAL '7 days',
    true
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO community_challenges (title, title_key, description, platform, max_amount, start_date, end_date, is_active)
  VALUES (
    '7天不买超过$50的非必需品',
    'defense.challenge.budget50',
    '7天内不购买超过$50的非必需品',
    NULL,
    50.00,
    week_start,
    week_start + INTERVAL '7 days',
    true
  )
  ON CONFLICT DO NOTHING;

  UPDATE community_challenges
  SET is_active = false
  WHERE end_date < NOW() AND is_active = true;
END;
$$ LANGUAGE plpgsql;

-- 3. 调度 cron (每周一 4:00 AM)
--    pg_cron 需要在 Supabase Dashboard → Database → Extensions 中启用
--    如果未启用, 这部分会静默跳过 (不会阻塞 migration)
DO $$
BEGIN
  SELECT cron.schedule(
    'weekly-community-challenges',
    '0 4 * * 1',
    'SELECT create_weekly_challenges()'
  );
  RAISE NOTICE 'pg_cron scheduled successfully';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available, skipping cron schedule. Enable pg_cron extension in Supabase Dashboard → Database → Extensions. You can manually call SELECT create_weekly_challenges() each Monday.';
END $$;

COMMENT ON FUNCTION create_weekly_challenges() IS '群体防御网络: 每周一自动创建社区挑战 + 标记上周挑战为 inactive';
