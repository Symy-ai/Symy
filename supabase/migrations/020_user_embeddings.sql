-- ============================================================
-- 020_user_embeddings.sql — RAG 向量库（道体二·共生 + 道用六·公开）
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
-- 目的：存储用户的冲动消费/收据/聊天历史的向量嵌入，用于 RAG 检索
-- 道经依据：道体二·共生（AI 记住用户的过去，双向闭环）+ 道用六·公开（用户可查自己向量）
-- 修改门槛：同总则（详见 constitution.md §五）
-- ============================================================

-- 1. 启用 pgvector extension（如未启用）
create extension if not exists vector;

-- 2. 用户向量嵌入表
create table if not exists public.user_embeddings (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    -- 来源类型：impulse_event / email_receipt / chat_message
    source_type text not null check (source_type in ('impulse_event', 'email_receipt', 'chat_message')),
    -- 来源记录 ID（对应原表的 id）
    source_id uuid not null,
    -- 文本内容（用于检索后展示，截断到 1000 字）
    content text not null,
    -- 元数据（platform/amount/category/created_at 等结构化字段）
    metadata jsonb not null default '{}',
    -- 向量嵌入（1536 维，对应 text-embedding-3-small）
    embedding vector(1536) not null,
    -- 嵌入生成时间
    embedded_at timestamptz not null default now(),
    -- 唯一约束：同一用户同一来源不重复嵌入
    unique(user_id, source_type, source_id)
);

-- 3. 索引
create index if not exists idx_user_embeddings_user_id on public.user_embeddings(user_id);
create index if not exists idx_user_embeddings_source_type on public.user_embeddings(source_type);
-- HNSW 向量索引（cosine distance，性能优于 ivfflat）
-- m=16, ef_construction=64 — Supabase 推荐参数
create index if not exists idx_user_embeddings_embedding
    on public.user_embeddings
    using hnsw (embedding vector_cosine_ops)
    with (m = 16, ef_construction = 64);

-- 4. RLS 策略
-- 4.1 用户只能查看/管理自己的向量（select only — 写入仅 service_role）
alter table public.user_embeddings enable row level security;

drop policy if exists "Users can read own embeddings" on public.user_embeddings;
create policy "Users can read own embeddings"
    on public.user_embeddings for select
    to authenticated
    using (user_id = auth.uid());

-- 4.2 用户不能直接 insert / update / delete（仅 service_role 通过 API Route 写入）
-- service_role 绕过 RLS，无需单独 policy

-- 5. 注释
comment on table public.user_embeddings is 'RAG 向量库 — 用户的冲动消费/收据/聊天历史向量化，用于 AI 检索用户上下文';
comment on column public.user_embeddings.source_type is 'impulse_event=冲动事件 / email_receipt=购物收据 / chat_message=聊天消息';
comment on column public.user_embeddings.embedding is 'text-embedding-3-small 向量，1536 维';

-- ============================================================
-- 6. 检索函数：retrieve_user_context
-- 给定 user_id + query_embedding + top_k，返回最相关的 K 条记录
-- 仅供 service_role 调用（API Route 用）
-- ============================================================
create or replace function public.retrieve_user_context(
    p_user_id uuid,
    p_query_embedding vector(1536),
    p_top_k integer default 5,
    p_source_types text[] default null  -- 可选：限定来源类型
)
returns table (
    id uuid,
    source_type text,
    source_id uuid,
    content text,
    metadata jsonb,
    similarity float
)
language sql
security definer
set search_path = public
as $$
    select
        e.id,
        e.source_type,
        e.source_id,
        e.content,
        e.metadata,
        1 - (e.embedding <=> p_query_embedding) as similarity
    from public.user_embeddings e
    where e.user_id = p_user_id
      and (p_source_types is null or e.source_type = any(p_source_types))
    order by e.embedding <=> p_query_embedding
    limit p_top_k;
$$;

-- 6.1 撤销 anon 执行权限（BUG-204 风格）
revoke execute on function public.retrieve_user_context(uuid, vector(1536), integer, text[]) from anon;
grant execute on function public.retrieve_user_context(uuid, vector(1536), integer, text[]) to authenticated, service_role;

comment on function public.retrieve_user_context is 'RAG 检索：给定 user_id + query 向量，返回 top-K 最相关记录（cosine similarity）';
