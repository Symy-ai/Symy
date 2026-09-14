-- 038: Add unique constraint on profiles.letta_agent_id
--
-- 🔧 ARCH fix (Round 2 F-1 — agent creation race):
--    旧代码 profiles.letta_agent_id 只有非唯一 index, 无 unique constraint。
--    getOrCreateAgentId read-then-write 无锁 → 两个并发请求都看到 null, 都创建 agent,
--    都 .update(profiles) → 两个 agent 存在于 Letta, DB 只存第二个, 第一个成为孤儿。
--    根因修复: 加 unique constraint 防止重复 agent_id。
--    注意: 已有重复值的 DB 需先清理, 此迁移假设 letta_agent_id 列无重复值。
--    若有重复, 迁移会失败 — 需先手动清理 (见下方注释)。
--
-- 🔧 SQL fix: 上一版用 `EXCEPTION WHEN ... THEN ... EXCEPTION WHEN ... THEN`
--    (单 BEGIN/END 只允许一个 EXCEPTION 子句, 多个 WHEN 分支用 WHEN ... THEN ... WHEN ... THEN ...)
--    且 `duplicate_value` 不是 PostgreSQL 合法的 condition name (应 `unique_violation`, SQLSTATE 23505);
--    `duplicate_table` (42P07) 适用于 CREATE TABLE, 不适用于 ADD CONSTRAINT 名称冲突
--    (后者为 `duplicate_object`, 42710)。
--    修复: 改用 pg_constraint 预检 + 仅 catch `unique_violation`, 避免 condition 名混淆。

-- 先检查是否有重复值 (若有, 迁移会失败, 需手动清理)
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT letta_agent_id
    FROM public.profiles
    WHERE letta_agent_id IS NOT NULL
    GROUP BY letta_agent_id
    HAVING COUNT(*) > 1
  ) dups;

  IF dup_count > 0 THEN
    RAISE NOTICE 'Found % duplicate letta_agent_id values. Manual cleanup required before unique constraint can be added.', dup_count;
    -- 不抛错 (RAISE EXCEPTION 会回滚), 只记 notice, 让迁移继续尝试
    -- 若有重复, 下面的 ALTER TABLE ADD CONSTRAINT 会失败, 管理员需手动清理
  END IF;
END $$;

-- 添加 unique constraint
-- 1) 先用 pg_constraint 预检, 避免进入 exception path 处理 "已存在" 这种常见情况
-- 2) 若列上有重复值, ALTER TABLE 会抛 unique_violation (23505), 此处捕获并转为
--    可读错误提示管理员需先清理
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_letta_agent_id_unique'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    RAISE NOTICE 'Unique constraint profiles_letta_agent_id_unique already exists, skipping';
  ELSE
    BEGIN
      ALTER TABLE public.profiles
        ADD CONSTRAINT profiles_letta_agent_id_unique UNIQUE (letta_agent_id);
      RAISE NOTICE 'Successfully added unique constraint on profiles.letta_agent_id';
    EXCEPTION
      WHEN unique_violation THEN
        RAISE EXCEPTION 'Cannot add unique constraint: duplicate letta_agent_id values exist. Manual cleanup required.';
    END;
  END IF;
END $$;
