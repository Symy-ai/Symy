-- ============================================================
-- 074_avatars_bucket.sql
-- 用户头像存储桶 + per-user RLS
-- ============================================================
-- 用途: Profile 页面上传头像 → 存到 avatars/{user_id}/{timestamp}.{ext}
--       公开读取 (头像 URL 嵌入 chat-bubble / profile-tab, 任何人可访问)
--       只允许本人上传/删除自己的头像 (auth.uid() = path 第一段)
-- ============================================================

-- 创建 avatars 存储桶（如果不存在）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,  -- 公开读取 (头像 URL 需要 chat-bubble 等前端组件无 auth 访问)
  5242880,  -- 5MB 限制
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
) ON CONFLICT (id) DO NOTHING;

-- 公开读取策略: 任何人都可以查看头像 (public bucket)
CREATE POLICY avatars_select ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

-- 认证用户只能上传到自己文件夹 (avatars/{user_id}/...)
-- storage.foldername(name) 返回路径段数组, 第一段是 user_id
CREATE POLICY avatars_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() = (storage.foldername(name))[1]::uuid
  );

-- 认证用户只能删除自己文件夹里的头像
CREATE POLICY avatars_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars'
    AND auth.uid() = (storage.foldername(name))[1]::uuid
  );

-- 认证用户只能更新自己文件夹里的头像
CREATE POLICY avatars_update ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars'
    AND auth.uid() = (storage.foldername(name))[1]::uuid
  );

COMMENT ON TABLE storage.objects IS '074: avatars bucket 添加 per-user RLS (insert/delete/update 限制 auth.uid() = path 第一段)';
