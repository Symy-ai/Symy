-- 🔧 需求七: 邀请激励系统 — 双向奖励
--    用户 A 分享邀请链接 → 用户 B 通过链接注册 + 完成第一次挑战 → 双方各得 50 代币 + Light Bearer 徽章

-- 1. profiles 加 ref_code 列 (8 字符短码, 邀请链接用)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ref_code text;

-- 2. ref_code 唯一索引 (防重复, 但允许 NULL — 旧用户未生成时为 NULL)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_ref_code_key ON profiles (ref_code) WHERE ref_code IS NOT NULL;

-- 3. 创建 invitations 表
CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referee_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referee_email text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected')),
  reward_amount integer NOT NULL DEFAULT 50,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- 4. referee_user_id 唯一索引 (一个用户只能被邀请一次)
CREATE UNIQUE INDEX IF NOT EXISTS invitations_referee_user_id_key ON invitations (referee_user_id);

-- 5. 启用 RLS
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- 6. RLS 策略: 用户只能读自己的邀请关系 (作为 referrer 或 referee)
CREATE POLICY "Users can read own invitations"
  ON invitations FOR SELECT
  USING (auth.uid() = referrer_user_id OR auth.uid() = referee_user_id);

-- 7. RLS 策略: 用户可以插入自己作为 referee 的邀请 (记录被邀请关系)
CREATE POLICY "Users can insert own referee invitation"
  ON invitations FOR INSERT
  WITH CHECK (auth.uid() = referee_user_id);

-- 8. 注释
COMMENT ON COLUMN profiles.ref_code IS '🔧 需求七: 8 字符邀请短码 (用于 symy.ai/?ref=CODE 链接)';
COMMENT ON TABLE invitations IS '🔧 需求七: 邀请关系表 — referee 完成第一次挑战后双方各得 50 代币 + Light Bearer 徽章';
