-- Owner TODO: apply after migration 147.
-- Guard: keep the effective UPDATE policy set aligned with the RLS WITH CHECK rule.
DO $$
DECLARE
  missing record;
BEGIN
  FOR missing IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd = 'UPDATE'
      AND qual IS NOT NULL
      AND with_check IS NULL
  LOOP
    RAISE EXCEPTION 'UPDATE policy lacks WITH CHECK: %.%', missing.tablename, missing.policyname;
  END LOOP;
END $$;
