-- ============================================================
-- 095: 群体防御网络 — 社区挑战 + 聚合视图
-- ============================================================
-- 目的: 群体防御网络功能的数据层
--   1. community_challenges — 每周自动创建的社区挑战
--   2. challenge_participants — 用户参与记录 + 签到
--   3. community_platform_stats — 平台诱导指数视图 (7天聚合)
--   4. community_total_stats — 社区总统计视图 (7天聚合)
--   5. community_challenge_stats — 社区挑战参与统计视图
--
-- 隐私保护:
--   - 所有聚合数据最低 5 条门槛 (HAVING COUNT(*) >= 5)
--   - 不返回用户身份信息
--   - RLS: community_challenges 公开可读, challenge_participants 只能读写自己的
-- ============================================================

-- 1. 社区挑战表
CREATE TABLE IF NOT EXISTS community_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  title_key TEXT,
  description TEXT,
  platform TEXT,
  max_amount NUMERIC(10,2),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 挑战参与者表
CREATE TABLE IF NOT EXISTS challenge_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES community_challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed')),
  current_day INTEGER DEFAULT 0,
  last_checkin_date DATE,
  UNIQUE(challenge_id, user_id)
);

-- 3. 索引
CREATE INDEX IF NOT EXISTS challenge_participants_user_idx
  ON challenge_participants(user_id);
CREATE INDEX IF NOT EXISTS challenge_participants_challenge_idx
  ON challenge_participants(challenge_id, status);
CREATE INDEX IF NOT EXISTS community_challenges_active_idx
  ON community_challenges(is_active, start_date, end_date);

-- 4. RLS
ALTER TABLE community_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_participants ENABLE ROW LEVEL SECURITY;

-- 5. community_challenges: 所有人可读 (公开挑战)
CREATE POLICY "Community challenges are public read"
  ON community_challenges FOR SELECT
  USING (true);

-- 6. challenge_participants: 用户只能读写自己的记录
CREATE POLICY "Users can read own participation"
  ON challenge_participants FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can join challenges"
  ON challenge_participants FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own participation"
  ON challenge_participants FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 7. 视图: 平台诱导指数 (7 天聚合, 最低 5 条)
CREATE OR REPLACE VIEW community_platform_stats AS
SELECT
  metadata->>'platform' AS platform,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
  COUNT(*) FILTER (WHERE status = 'passed') AS passed_count,
  COUNT(*) AS total_count,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'failed')::numeric /
    NULLIF(COUNT(*), 0) * 100, 1
  ) AS inducement_index,
  COALESCE(SUM(amount) FILTER (WHERE status = 'passed'), 0) AS total_saved
FROM active_challenges
WHERE completed_at >= NOW() - INTERVAL '7 days'
  AND metadata->>'platform' IS NOT NULL
GROUP BY metadata->>'platform'
HAVING COUNT(*) >= 5
ORDER BY inducement_index DESC;

-- 8. 视图: 社区总统计 (7 天)
CREATE OR REPLACE VIEW community_total_stats AS
SELECT
  COUNT(DISTINCT user_id) AS active_users_7d,
  COUNT(*) FILTER (WHERE status = 'passed') AS total_passed_7d,
  COUNT(*) FILTER (WHERE status = 'failed') AS total_failed_7d,
  COALESCE(SUM(amount) FILTER (WHERE status = 'passed'), 0) AS total_saved_7d
FROM active_challenges
WHERE completed_at >= NOW() - INTERVAL '7 days';

-- 9. 视图: 社区挑战参与统计
CREATE OR REPLACE VIEW community_challenge_stats AS
SELECT
  c.id AS challenge_id,
  c.title,
  c.title_key,
  c.platform,
  c.start_date,
  c.end_date,
  c.is_active,
  COUNT(p.id) AS total_participants,
  COUNT(p.id) FILTER (WHERE p.status = 'active') AS active_participants,
  COUNT(p.id) FILTER (WHERE p.status = 'completed') AS completed_participants,
  COUNT(p.id) FILTER (WHERE p.status = 'failed') AS failed_participants
FROM community_challenges c
LEFT JOIN challenge_participants p ON c.id = p.challenge_id
WHERE c.is_active = true
GROUP BY c.id, c.title, c.title_key, c.platform, c.start_date, c.end_date, c.is_active;

-- 10. 注释
COMMENT ON TABLE community_challenges IS '群体防御网络: 每周社区挑战 (7天不买某平台推荐等)';
COMMENT ON TABLE challenge_participants IS '群体防御网络: 用户参与社区挑战的记录 + 每日签到';
COMMENT ON VIEW community_platform_stats IS '群体防御网络: 平台诱导指数 (7天聚合, 最低5条, 隐私保护)';
COMMENT ON VIEW community_total_stats IS '群体防御网络: 社区总统计 (7天聚合)';
COMMENT ON VIEW community_challenge_stats IS '群体防御网络: 社区挑战参与统计';
