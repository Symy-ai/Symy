-- 045: Add triggers to delete orphan embeddings when source rows are deleted
--
-- 🔧 ARCH fix (Round 3 数据审计 C6 — RAG orphan embeddings):
--    旧代码 user_embeddings.source_id 不是外键 → 删 chat_messages/impulse_events/email_receipts 时
--    对应 embedding 残留 → retrieve_user_context 仍返回已删除内容的 embedding (隐私泄露 + stale retrieval)。
--    根因修复: 添加 AFTER DELETE trigger, 源行删除时自动删对应 embedding。

-- ============================================================
-- 1. 通用函数: 按源类型删除 embedding
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_embedding_on_source_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.user_embeddings
    WHERE user_id = OLD.user_id
      AND source_type = TG_ARGV[0]
      AND source_id = OLD.id;
    RETURN OLD;
END;
$$;

-- ============================================================
-- 2. chat_messages 删除时删 embedding
-- ============================================================
DROP TRIGGER IF EXISTS chat_messages_delete_embedding ON public.chat_messages;
CREATE TRIGGER chat_messages_delete_embedding
    AFTER DELETE ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.delete_embedding_on_source_delete('chat_message');

-- ============================================================
-- 3. impulse_events 删除时删 embedding
-- ============================================================
DROP TRIGGER IF EXISTS impulse_events_delete_embedding ON public.impulse_events;
CREATE TRIGGER impulse_events_delete_embedding
    AFTER DELETE ON public.impulse_events
    FOR EACH ROW EXECUTE FUNCTION public.delete_embedding_on_source_delete('impulse_event');

-- ============================================================
-- 4. email_receipts 删除时删 embedding
-- ============================================================
DROP TRIGGER IF EXISTS email_receipts_delete_embedding ON public.email_receipts;
CREATE TRIGGER email_receipts_delete_embedding
    AFTER DELETE ON public.email_receipts
    FOR EACH ROW EXECUTE FUNCTION public.delete_embedding_on_source_delete('email_receipt');

COMMENT ON FUNCTION public.delete_embedding_on_source_delete IS
  'Round 3 C6 fix: cascade delete embeddings when source row is deleted';

-- 验证 triggers 已创建
DO $$
BEGIN
    ASSERT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'chat_messages_delete_embedding'), 'chat_messages trigger missing';
    ASSERT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'impulse_events_delete_embedding'), 'impulse_events trigger missing';
    ASSERT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'email_receipts_delete_embedding'), 'email_receipts trigger missing';
END $$;
