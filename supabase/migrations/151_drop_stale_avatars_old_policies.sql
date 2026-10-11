-- ============================================================
-- R544: 清理 avatars bucket 074 旧策略残留 (select/delete/insert)
--
-- 🔧 R543 同型狩猎 (R543 修了 UPDATE 的穿透, R544 扫全 cmd):
--    074_avatars_bucket.sql 创建 avatars_select/delete/insert (TO public),
--    114_fix_avatars_storage_policies.sql 重建为 *_policy 版 (TO authenticated,
--    带 foldername 自有约束) 但均未 DROP 旧策略。
--
--    真风险: avatars_select (TO public) qual 仅有 bucket_id='avatars'
--    无 foldername 约束 → public 角色 (含 anon) 可 SELECT 整个 bucket。
--    114 的收紧设计 (自有文件夹) 被旧策略 OR 合并绕过。
--
--    delete/insert 旧版虽带 foldername 约束, 但 TO public + OR 合并下
--    冗余 — 统一删旧留新 (114 版)。
-- ============================================================

DROP POLICY IF EXISTS "avatars_select" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete" ON storage.objects;
DROP POLICY IF EXISTS "avatars_insert" ON storage.objects;
