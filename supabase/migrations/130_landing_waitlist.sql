-- Landing page waitlist for anonymous (unregistered) visitors
CREATE TABLE IF NOT EXISTS landing_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  source text NOT NULL DEFAULT 'landing_page',
  is_registered boolean NOT NULL DEFAULT false,
  registered_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  registered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: anonymous users can INSERT (join waitlist), nobody can read via API (admin only via dashboard)
ALTER TABLE landing_waitlist ENABLE ROW LEVEL SECURITY;

-- 允许匿名插入（anon role）
CREATE POLICY "Anyone can join waitlist"
  ON landing_waitlist FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    length(email) <= 200
    AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    AND source IN ('landing_page')
  );

-- 不允许通过 API 读取（admin 通过 Supabase Dashboard 管理）
-- 不加 SELECT policy = 默认拒绝

CREATE INDEX idx_landing_waitlist_email ON landing_waitlist(email);
CREATE INDEX idx_landing_waitlist_source ON landing_waitlist(source);

COMMENT ON TABLE landing_waitlist IS 'Landing page waitlist — anonymous email capture for unregistered visitors. is_registered flips to true when they later sign up.';
