-- 🔧 需求六: Premium 候补名单表
--    用户点击 "加入候补名单" 时记录邮箱 (Premium 未上线, 收集意向用户)

-- 1. 创建 premium_waitlist 表
CREATE TABLE IF NOT EXISTS premium_waitlist (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. 启用 RLS
ALTER TABLE premium_waitlist ENABLE ROW LEVEL SECURITY;

-- 3. RLS 策略: 用户只能读写自己的候补记录
CREATE POLICY "Users can read own waitlist entry"
  ON premium_waitlist FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own waitlist entry"
  ON premium_waitlist FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own waitlist entry"
  ON premium_waitlist FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. 注释
COMMENT ON TABLE premium_waitlist IS '🔧 需求六: Premium 候补名单 (Premium 未上线时收集意向用户邮箱)';
