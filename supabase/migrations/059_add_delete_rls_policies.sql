-- 059: Add DELETE RLS policies for health_events and impulse_events (Round 19 P0)
--
-- 🔧 ARCH fix (Round 17 audit CRITICAL #2 — single-delete cleanup dead code):
--    src/app/api/email/receipts/route.ts:317-338 在删除 email receipt 时同时清理
--    orphan health_events 和 impulse_events, 但这两个表都只有 SELECT/INSERT RLS policy,
--    没有 DELETE policy for authenticated users → Supabase 静默删除 0 行。
--    根因修复: 加 DELETE RLS policy 让用户能删除自己的 health_events 和 impulse_events。
--
-- 注意:
--   - service_role 一直有全权限 (FOR ALL policy), 不受影响
--   - authenticated 用户之前只能 SELECT/INSERT, 加 DELETE 后能清理自己的孤儿事件
--   - USING (auth.uid() = user_id) 确保用户只能删除自己的行 (不能删别人的)

-- ============================================================
-- health_events: DELETE policy
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'health_events'
      AND policyname = 'Users can delete their own health events'
  ) THEN
    CREATE POLICY "Users can delete their own health events"
      ON public.health_events FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================
-- impulse_events: DELETE policy
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'impulse_events'
      AND policyname = 'Users can delete their own impulse events'
  ) THEN
    CREATE POLICY "Users can delete their own impulse events"
      ON public.impulse_events FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================
-- Add receipt_id column to impulse_events (replace LIKE on raw_text)
-- ============================================================
-- 🔧 ARCH fix (Round 17 audit CRITICAL #2 — impulse_events LIKE on raw_text 永不匹配):
--    旧代码: src/app/api/email/receipts/route.ts:332-338
--      .like('raw_text', `%${messageId || receiptId}%`)
--    但 raw_text 字段存的是 email body snippet (substring(0, 1000)),
--    不含 messageId 或 receiptId → LIKE 永不匹配 → 0 行删除。
--    根因修复: 加 receipt_id UUID 列 (nullable, 渐进迁移),
--    record_impulse 写入 receipt_id, receipts/route.ts DELETE 用精确 .eq('receipt_id', ?)。

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'impulse_events' AND column_name = 'receipt_id'
  ) THEN
    ALTER TABLE public.impulse_events
      ADD COLUMN receipt_id UUID REFERENCES public.email_receipts(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_impulse_events_receipt_id
      ON public.impulse_events (receipt_id)
      WHERE receipt_id IS NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.impulse_events.receipt_id IS
  'Round 19 fix: Optional FK to email_receipts for precise orphan cleanup (replaces fragile LIKE on raw_text)';
