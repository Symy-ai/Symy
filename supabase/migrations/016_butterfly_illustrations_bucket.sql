-- ============================================================
-- 016_butterfly_illustrations_bucket.sql
-- 蝴蝶效应人生剧情系统 — 插图存储桶
-- ============================================================

-- 创建 butterfly-illustrations 存储桶（如果不存在）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'butterfly-illustrations',
  'butterfly-illustrations',
  true,  -- 公开读取
  5242880,  -- 5MB 限制（base64 图片解码后可能较大）
  ARRAY['image/png', 'image/jpeg', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- 公开读取策略：任何人都可以查看插图
CREATE POLICY butterfly_illustrations_select ON storage.objects
  FOR SELECT USING (bucket_id = 'butterfly-illustrations');

-- 认证用户可以上传插图
CREATE POLICY butterfly_illustrations_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'butterfly-illustrations'
    AND auth.role() = 'service_role'
  );

-- service_role 可以删除插图
CREATE POLICY butterfly_illustrations_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'butterfly-illustrations'
    AND auth.role() = 'service_role'
  );
