-- Transparency weekly report subscribers (batch84-c)
-- 周报订阅 — BP 0918 p20 内容引擎闭环: 每周透明度报告 → 订阅 → 回访。
-- owner 铁律②: migration 只随库提交, 由 owner 手动执行。

CREATE TABLE IF NOT EXISTS transparency_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  locale text NOT NULL DEFAULT 'en',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: 与 landing_waitlist (130) 同模式 — anon/authenticated 可插自己,
-- 不加 SELECT policy = 默认拒绝 (订阅名单只能从 Dashboard/后台读)。
ALTER TABLE transparency_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can subscribe to the weekly report"
  ON transparency_subscribers FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    length(email) <= 200
    AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    AND locale IN ('zh', 'en')
  );

CREATE INDEX idx_transparency_subscribers_email ON transparency_subscribers(email);
CREATE INDEX idx_transparency_subscribers_locale ON transparency_subscribers(locale);

COMMENT ON TABLE transparency_subscribers IS 'Weekly transparency report subscribers — public email capture on /transparency. Anti-enumeration: duplicate INSERT surfaces as success at the API layer.';
