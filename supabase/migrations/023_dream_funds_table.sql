-- 023_dream_funds_table.sql
-- 梦想基金独立表：从 buddy_state.dream_funds JSONB 迁移为独立行
-- 保留 buddy_state.dream_funds 作为缓存/兼容字段

-- 1. 创建独立表
CREATE TABLE IF NOT EXISTS dream_funds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fund_id TEXT NOT NULL,          -- 用户可见 ID（如 df-1, df-xxxx）
  name TEXT NOT NULL DEFAULT 'Dream Fund',
  target INTEGER NOT NULL DEFAULT 1000 CHECK (target > 0 AND target <= 1000000),
  current INTEGER NOT NULL DEFAULT 0 CHECK (current >= 0 AND current <= target),
  emoji TEXT NOT NULL DEFAULT '🎯',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- 每个用户的 fund_id 唯一
  UNIQUE(user_id, fund_id)
);

-- 2. 索引
CREATE INDEX IF NOT EXISTS idx_dream_funds_user_id ON dream_funds(user_id);

-- 3. RLS 策略（用户只能访问自己的基金）
ALTER TABLE dream_funds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own dream funds"
  ON dream_funds FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own dream funds"
  ON dream_funds FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own dream funds"
  ON dream_funds FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own dream funds"
  ON dream_funds FOR DELETE
  USING (auth.uid() = user_id);

-- 4. 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_dream_funds_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_dream_funds_updated_at ON dream_funds;
CREATE TRIGGER trigger_dream_funds_updated_at
  BEFORE UPDATE ON dream_funds
  FOR EACH ROW
  EXECUTE FUNCTION update_dream_funds_updated_at();

-- 5. 迁移现有数据：从 buddy_state.dream_funds JSONB 提取到独立表
-- 仅迁移已有行，不删除 JSONB 字段（保持向后兼容）
INSERT INTO dream_funds (user_id, fund_id, name, target, current, emoji, sort_order)
SELECT 
  bs.user_id,
  elem->>'id' AS fund_id,
  COALESCE(elem->>'name', 'Dream Fund') AS name,
  COALESCE((elem->>'target')::integer, 1000) AS target,
  COALESCE((elem->>'current')::integer, 0) AS current,
  COALESCE(elem->>'emoji', '🎯') AS emoji,
  ord - 1 AS sort_order
FROM buddy_state bs,
  jsonb_array_elements(
    CASE 
      WHEN bs.dream_funds IS NULL OR jsonb_array_length(bs.dream_funds) = 0
      THEN '[{"id":"df-1","name":"Credit Card Payoff","target":2000,"current":0,"emoji":"💳"},{"id":"df-2","name":"Iceland Trip","target":5000,"current":0,"emoji":"🏔️"}]'::jsonb
      ELSE bs.dream_funds
    END
  ) WITH ORDINALITY AS t(elem, ord)
ON CONFLICT (user_id, fund_id) DO NOTHING;
