-- ============================================================
-- 014_butterfly_sessions.sql
-- 蝴蝶效应人生剧情系统 — 会话和选择表
-- ============================================================

-- 蝴蝶效应会话表
CREATE TABLE IF NOT EXISTS butterfly_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  decision_type TEXT NOT NULL CHECK (decision_type IN ('bought', 'resisted')),
  decision_description TEXT NOT NULL,
  amount NUMERIC,
  platform TEXT,
  context TEXT,
  -- 大纲 JSON（版本化，选择后重新生成）
  outline JSONB NOT NULL DEFAULT '{}',
  -- 当前讲述到第几章（0 = 未开始）
  current_chapter INTEGER NOT NULL DEFAULT 0,
  -- 已完成的章节内容（JSON 数组）
  chapters JSONB NOT NULL DEFAULT '[]',
  -- 用户做出的选择（JSON 数组）
  choices JSONB NOT NULL DEFAULT '[]',
  -- 会话状态
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_butterfly_sessions_user_id ON butterfly_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_butterfly_sessions_user_status ON butterfly_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_butterfly_sessions_created_at ON butterfly_sessions(created_at DESC);

-- RLS 策略
ALTER TABLE butterfly_sessions ENABLE ROW LEVEL SECURITY;

-- 用户只能看自己的会话
CREATE POLICY butterfly_sessions_select ON butterfly_sessions
  FOR SELECT USING (auth.uid() = user_id);

-- 用户只能插入自己的会话
CREATE POLICY butterfly_sessions_insert ON butterfly_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 用户只能更新自己的会话
CREATE POLICY butterfly_sessions_update ON butterfly_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- 用户只能删除自己的会话
CREATE POLICY butterfly_sessions_delete ON butterfly_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- service_role 可以访问所有数据
CREATE POLICY butterfly_sessions_service ON butterfly_sessions
  FOR ALL USING (auth.role() = 'service_role');

-- updated_at 自动更新触发器
CREATE OR REPLACE FUNCTION update_butterfly_session_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_butterfly_session_updated_at ON butterfly_sessions;
CREATE TRIGGER trigger_update_butterfly_session_updated_at
  BEFORE UPDATE ON butterfly_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_butterfly_session_updated_at();
