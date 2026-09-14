-- 037: Add DELETE RLS policy for email_receipts
--
-- 🔧 ARCH fix (Round 2 H5):
-- 旧代码 email_receipts 只有 SELECT/INSERT/UPDATE RLS policy, 没有 DELETE policy。
-- 用户调 DELETE /api/email/receipts?id=xxx 时, RLS 静默删除 0 行 (无 error), 路由返回 success。
-- 用户以为删除了, 刷新后收据重现。
-- purge 端点用 admin client 绕过 RLS 作为 workaround, 但单条删除仍静默失败。
--
-- 根因修复: 添加 DELETE RLS policy, 让用户能删除自己的收据。
-- 后续可移除 receipts/route.ts purge 分支的 admin client workaround。

CREATE POLICY "Users delete own email receipts"
    ON public.email_receipts
    FOR DELETE
    USING (auth.uid() = user_id);

-- 验证 policy 已创建
DO $$
BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'email_receipts'
          AND policyname = 'Users delete own email receipts'
    ), 'DELETE policy on email_receipts was not created';
END $$;
