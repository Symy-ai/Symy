-- Bug 7 fix: Ensure butterfly_sessions.amount is NUMERIC(10,2) not real/float4
-- Float4 causes 499.99 → 499.989990234375 (single-precision truncation)
-- NUMERIC(10,2) stores exact decimal with 2 decimal places (cents)

-- Check and fix: if column is real/float4, alter to NUMERIC(10,2)
-- This is idempotent — if already NUMERIC, it just narrows precision
DO $$
BEGIN
  -- Only alter if the column type is 'real' (float4)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'butterfly_sessions'
      AND column_name = 'amount'
      AND udt_name = 'float4'
  ) THEN
    ALTER TABLE butterfly_sessions ALTER COLUMN amount TYPE NUMERIC(10,2);
  END IF;

  -- Also handle if it's double precision (float8) — less severe but still imprecise
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'butterfly_sessions'
      AND column_name = 'amount'
      AND udt_name = 'float8'
  ) THEN
    ALTER TABLE butterfly_sessions ALTER COLUMN amount TYPE NUMERIC(10,2);
  END IF;

  -- If already numeric, just ensure precision
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'butterfly_sessions'
      AND column_name = 'amount'
      AND udt_name = 'numeric'
      AND (numeric_precision IS NULL OR numeric_precision > 10 OR numeric_scale IS NULL OR numeric_scale != 2)
  ) THEN
    ALTER TABLE butterfly_sessions ALTER COLUMN amount TYPE NUMERIC(10,2);
  END IF;
END
$$;
