-- ============================================================
-- shopping_facts — 购物事实记忆块 (backlog A3, commerce-agents 记忆块模式)
-- Notes:
-- - 64/200 长度上限照抄上游记忆块约定; 三类目枚举与 src/lib/shopping-facts.ts 对齐。
-- - 本批只交付落库件 (schema + lib), 提取管道 (night lane) 后续批次接入;
--   server 写路径走 service key, RLS 仍启用作为纵深防御 (UPDATE 必带 WITH CHECK)。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shopping_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('preference', 'size', 'budget')),
  key text NOT NULL CHECK (char_length(key) BETWEEN 1 AND 64),
  value text NOT NULL CHECK (char_length(value) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, category, key)
);

ALTER TABLE public.shopping_facts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_shopping_facts_user_updated
  ON public.shopping_facts (user_id, updated_at DESC);

-- RLS: 只允许用户读写自己的事实行 (executor 用 service key 不受 RLS 限制)
DROP POLICY IF EXISTS "shopping_facts_select_own" ON public.shopping_facts;
CREATE POLICY "shopping_facts_select_own"
  ON public.shopping_facts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "shopping_facts_insert_own" ON public.shopping_facts;
CREATE POLICY "shopping_facts_insert_own"
  ON public.shopping_facts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "shopping_facts_update_own" ON public.shopping_facts;
CREATE POLICY "shopping_facts_update_own"
  ON public.shopping_facts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "shopping_facts_delete_own" ON public.shopping_facts;
CREATE POLICY "shopping_facts_delete_own"
  ON public.shopping_facts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
