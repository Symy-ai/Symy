-- ============================================================
-- R543: 清理 avatars bucket 旧 UPDATE 策略残留
--
-- 🔧 R543 迁移链审计发现: 074_avatars_bucket.sql 创建了 "avatars_update"
--    (无 WITH CHECK), 114_fix_avatars_storage_policies.sql 重建为
--    "avatars_update_policy" (带 WITH CHECK) 但没有 DROP 旧策略。
--    两条 UPDATE 策略并存 → PostgreSQL RLS 多策略 OR 合并语义:
--    USING 经旧策略通过即放行, WITH CHECK 防线被旧策略穿透
--    (用户可把 storage 对象 UPDATE 移到别人文件夹)。
--
-- 修复: DROP 旧策略, 只留 114 的 avatars_update_policy。
-- ============================================================

DROP POLICY IF EXISTS "avatars_update" ON storage.objects;
