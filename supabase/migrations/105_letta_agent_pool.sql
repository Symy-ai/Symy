-- ============================================================
-- 095: Letta Agent Pool — 预创建无主 agent 池
--
-- 目的: 新注册用户直接从池子分配 agent, 避免实时创建 (30s+) 的慢体验
--
-- 池子逻辑:
-- 1. 初始池子大小 = 1 (方便测试)
-- 2. 每分钟 cron 检测无主 agent 数
-- 3. 如果剩余无主 agent >= 池子大小的 1/4 → 只补满 (补到当前大小)
-- 4. 如果剩余无主 agent < 池子大小的 1/4 → 先翻倍池子大小, 再补满
--
-- 分配逻辑:
-- - 新用户注册/登录时, 从池子取一个无主 agent
-- - 更新 agent_pool.status='assigned' + assigned_to=user_id
-- - 更新 profiles.letta_agent_id = agent_id
-- ============================================================

-- 1. Agent Pool 表
CREATE TABLE IF NOT EXISTS public.letta_agent_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Letta agent ID (从 Letta API 返回)
  letta_agent_id TEXT NOT NULL UNIQUE,
  -- 状态: 'available' (无主, 可分配) | 'assigned' (已分配给用户) | 'creating' (正在创建中) | 'failed' (创建失败)
  status TEXT NOT NULL DEFAULT 'creating' CHECK (status IN ('available', 'assigned', 'creating', 'failed')),
  -- 分配给哪个用户 (status='assigned' 时有值)
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- 创建时间
  created_at TIMESTAMPTZ DEFAULT now(),
  -- 分配时间
  assigned_at TIMESTAMPTZ,
  -- 失败原因 (status='failed' 时有值)
  failure_reason TEXT
);

-- 2. 索引
CREATE INDEX IF NOT EXISTS letta_agent_pool_status_idx
  ON public.letta_agent_pool(status);

CREATE INDEX IF NOT EXISTS letta_agent_pool_assigned_to_idx
  ON public.letta_agent_pool(assigned_to)
  WHERE assigned_to IS NOT NULL;

-- 3. 池子配置表 (存储当前池子大小等配置)
CREATE TABLE IF NOT EXISTS public.letta_agent_pool_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- 单行表
  -- 当前池子目标大小 (会翻倍)
  pool_size INTEGER NOT NULL DEFAULT 1,
  -- 初始池子大小 (翻倍的基数)
  initial_pool_size INTEGER NOT NULL DEFAULT 1,
  -- 上次 cron 检查时间
  last_cron_check TIMESTAMPTZ,
  -- 上次补满时间
  last_refill_at TIMESTAMPTZ,
  -- 上次翻倍时间
  last_doubled_at TIMESTAMPTZ,
  -- 更新时间
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. 初始化配置行 (如果不存在)
INSERT INTO public.letta_agent_pool_config (id, pool_size, initial_pool_size)
VALUES (1, 1, 1)
ON CONFLICT (id) DO NOTHING;

-- 5. RLS
ALTER TABLE public.letta_agent_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.letta_agent_pool_config ENABLE ROW LEVEL SECURITY;

-- 6. RLS 策略: 只有 service_role 可以读写 (客户端不直接访问)
--    (不创建任何 policy = 默认拒绝所有访问, 只有 service_role bypass RLS)

-- 7. 注释
COMMENT ON TABLE public.letta_agent_pool IS 'Letta Agent 池子 — 预创建无主 agent, 新用户直接分配';
COMMENT ON TABLE public.letta_agent_pool_config IS 'Agent 池子配置 — 池子大小 + cron 时间戳';

-- 8. 函数: 获取可用 agent 数
CREATE OR REPLACE FUNCTION get_available_agent_count()
RETURNS INTEGER AS $$
BEGIN
  RETURN (SELECT COUNT(*) FROM public.letta_agent_pool WHERE status = 'available');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. 函数: 原子分配一个可用 agent 给用户
--    返回 letta_agent_id (成功) 或 NULL (池子空)
CREATE OR REPLACE FUNCTION assign_pool_agent(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_agent_id TEXT;
  v_pool_id UUID;
BEGIN
  -- 原子操作: SELECT ... FOR UPDATE SKIP LOCKED 取一个可用 agent
  SELECT id, letta_agent_id INTO v_pool_id, v_agent_id
  FROM public.letta_agent_pool
  WHERE status = 'available'
  ORDER BY created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_agent_id IS NULL THEN
    RETURN NULL;  -- 池子空
  END IF;

  -- 标记为已分配
  UPDATE public.letta_agent_pool
  SET status = 'assigned',
      assigned_to = p_user_id,
      assigned_at = now()
  WHERE id = v_pool_id;

  RETURN v_agent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
