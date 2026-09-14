-- ============================================================
-- 114: Fix avatars Storage bucket policies (ARCH-6 #16/#17)
-- ============================================================
-- 🔧 2026-07-15 (ARCH-6 #16/#17 修复)
--
-- Bug 1 (#16): avatars bucket UPDATE policy missing WITH CHECK
--   → user can MOVE their avatar into another user's folder (impersonation)
--
-- Bug 2 (#17): avatars bucket SELECT policy uses USING(bucket_id='avatars')
--   with no TO clause → defaults to PUBLIC → anon can LIST all avatar paths
--   (user_id enumeration)
--
-- Fix:
-- 1. Recreate UPDATE policy with WITH CHECK (folder = auth.uid())
-- 2. Recreate SELECT policy with TO authenticated (not PUBLIC)
-- ============================================================

-- Drop existing policies
DROP POLICY IF EXISTS "avatars_select_policy" ON storage.objects;
DROP POLICY IF EXISTS "avatars_insert_policy" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update_policy" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete_policy" ON storage.objects;

-- SELECT: only authenticated users can read their own avatars
-- (not PUBLIC — prevents anon from listing all user_ids)
CREATE POLICY "avatars_select_policy" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- INSERT: user can only insert into their own folder
CREATE POLICY "avatars_insert_policy" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE: user can only update their own avatar (WITH CHECK prevents moving to another folder)
CREATE POLICY "avatars_update_policy" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE: user can only delete their own avatar
CREATE POLICY "avatars_delete_policy" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMENT ON TABLE storage.objects IS '2026-07-15 (ARCH-6 #16/#17): avatars bucket policies fixed — SELECT no longer PUBLIC, UPDATE has WITH CHECK';
