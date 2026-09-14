-- 042: admin_jobs table — batch admin action resumability
--
-- 🔧 ARCH fix (Round 2 F-10 — batch admin actions no resumability):
--    旧代码 update_all_user_prompts / update_all_user_models / update_all_agent_endpoints / migrate_to_per_user
--    都在单次请求内循环处理所有用户。若中途失败 (用户 50/100) 或 Vercel 超时 (60s), 前 49 个已改,
--    后 51 个未改, 无 rollback, 无 resumability。管理员无法知道哪些用户需要重试。
--
--    根因修复: 新建 admin_jobs 表, 每个用户操作是一行, 支持 pending/in_progress/success/failed 状态。
--    重试时只处理 failed/pending 行。
--
--    注意: 此迁移只建表, 不改 admin action 代码 (后续 PR 用)。

CREATE TABLE IF NOT EXISTS public.admin_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL,  -- 'update_user_prompts' | 'update_user_models' | 'update_agent_endpoints' | 'migrate_per_user'
    user_id UUID,            -- 目标用户 (NULL = 全平台批量)
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'in_progress' | 'success' | 'failed'
    error TEXT,              -- 失败原因
    metadata JSONB DEFAULT '{}'::jsonb,  -- 操作特定数据 (如 old_model, new_model)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- 索引: 按 job_type + status 查询待处理任务
CREATE INDEX IF NOT EXISTS idx_admin_jobs_type_status
    ON public.admin_jobs (job_type, status)
    WHERE status IN ('pending', 'failed');

-- 索引: 按创建时间排序
CREATE INDEX IF NOT EXISTS idx_admin_jobs_created_at
    ON public.admin_jobs (created_at DESC);

-- RLS: 只有 admin (service_role) 可访问
ALTER TABLE public.admin_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only service_role can manage admin_jobs"
    ON public.admin_jobs
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.admin_jobs IS
  'Round 2 F-10 fix: Batch admin action job tracking for resumability';
