-- ============================================================
-- 100: 群体防御网络 — 修复 create_weekly_challenges() 重复插入 + 支持 week_offset
--
-- 问题:
-- 1. community_challenges 表没有 UNIQUE 约束 (除了 PRIMARY KEY id)
--    → 每次调用 create_weekly_challenges() 都会插入重复行 (id 自增)
--    → ON CONFLICT DO NOTHING 永远不会触发 (因为没有冲突)
-- 2. 函数不支持预创建下周挑战
--    → 用户周日看到 Day 7/7 "Challenge ended" 但无法提前创建下周挑战
-- 3. 函数只标记 end_date < NOW() 的为 inactive
--    → 但当 week_offset > 0 创建下周挑战时, 旧挑战仍标记为 active, 显示混乱
--
-- 修复:
-- 1. 添加 UNIQUE (title_key, start_date) 约束 (NULL title_key 不冲突, 安全)
--    → ON CONFLICT (title_key, start_date) DO NOTHING 真正生效
-- 2. 函数签名改为 create_weekly_challenges(p_week_offset INTEGER DEFAULT 0)
--    → p_week_offset=0 (默认): 当前周
--    → p_week_offset=1: 下周 (用于预创建)
--    → p_week_offset=-1: 上周 (用于补创建)
-- 3. 当 p_week_offset > 0 时, 把当前周挑战标记为 inactive (下周挑战已创建)
--    → UI 只显示新一周的挑战, 避免显示 Day 7/7 + Day 1/7 混乱
--
-- 兼容性:
-- - 旧调用 create_weekly_challenges() 仍可工作 (p_week_offset 默认 0)
-- - 旧 pg_cron 调度 'SELECT create_weekly_challenges()' 仍可工作
-- ============================================================

-- 1. 清理可能的重复行 (保留最早创建的)
--    使用 ctid 避免删除所有行 (如果同一组有多行, 保留 ctid 最小的)
DELETE FROM community_challenges a
USING community_challenges b
WHERE a.ctid > b.ctid
  AND a.title_key IS NOT NULL
  AND a.title_key = b.title_key
  AND a.start_date = b.start_date;

-- 2. 添加 UNIQUE 约束 (title_key + start_date)
--    NULL title_key 不参与唯一约束 (PostgreSQL NULL 语义: NULL != NULL)
--    当前 seed 数据都有 title_key, 所以这个约束覆盖所有挑战
CREATE UNIQUE INDEX IF NOT EXISTS community_challenges_title_key_start_date_uniq
  ON community_challenges(title_key, start_date);

-- 3. 修改函数: 支持 p_week_offset 参数
CREATE OR REPLACE FUNCTION create_weekly_challenges(p_week_offset INTEGER DEFAULT 0)
RETURNS void AS $$
DECLARE
  week_start timestamptz := date_trunc('week', NOW()) + (p_week_offset * INTERVAL '7 days');
BEGIN
  -- 1. 插入指定周的 3 个挑战 (基于 p_week_offset)
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
  ON CONFLICT (title_key, start_date) DO NOTHING;

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
  ON CONFLICT (title_key, start_date) DO NOTHING;

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
  ON CONFLICT (title_key, start_date) DO NOTHING;

  -- 2. 标记已过期的挑战为 inactive (end_date < NOW())
  UPDATE community_challenges
  SET is_active = false
  WHERE end_date < NOW() AND is_active = true;

  -- 3. 当 p_week_offset > 0 (预创建下周挑战) 时:
  --    把当前周及更早的挑战标记为 inactive, 让 UI 只显示下周挑战
  --    (用户已 join 的记录仍保留在 challenge_participants, 只是 UI 不再显示)
  IF p_week_offset > 0 THEN
    UPDATE community_challenges
    SET is_active = false
    WHERE is_active = true
      AND start_date < week_start;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 4. 更新注释
COMMENT ON FUNCTION create_weekly_challenges(INTEGER) IS
  '群体防御网络: 创建指定周的社区挑战 (p_week_offset=0 本周, 1 下周, -1 上周) + 标记过期挑战为 inactive';

-- 5. 保留旧签名 create_weekly_challenges() 兼容 (调用时不传参, 默认 p_week_offset=0)
--    PostgreSQL 支持 DEFAULT 参数, 旧调用 SELECT create_weekly_challenges() 仍可工作
