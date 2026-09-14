-- ============================================================
-- 021_user_embeddings_zhipu_1024.sql — RAG 向量库：1024 维（智谱 embedding-3 降维）
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
-- 背景：
-- - migration 020 创建的是 vector(1536)（OpenAI text-embedding-3-small）
-- - 实际供应商换成智谱 AI embedding-3，默认 2048 维
-- - pgvector HNSW 索引限制 ≤ 2000 维，所以调 API 时指定 dimensions=1024
-- - 智谱 embedding-3 支持 1024/768/512/256 降维，1024 维检索质量足够（BGE-m3 同维）
--
-- 步骤：
-- 1. 删除旧表 + 旧索引 + 旧函数（CASCADE）
-- 2. 重建表（embedding vector(1024)）
-- 3. 重建索引 + RLS + 检索函数
--
-- 修改门槛：同总则（详见 constitution.md §五）
-- ============================================================

-- 1. 删除旧表（如果存在）— CASCADE 自动删除索引 + RLS + 函数依赖
drop table if exists public.user_embeddings cascade;

-- 2. 删除旧检索函数（如果存在，覆盖 1536/2048 两种维度）
drop function if exists public.retrieve_user_context(uuid, vector(1536), integer, text[]);
drop function if exists public.retrieve_user_context(uuid, vector(2048), integer, text[]);
drop function if exists public.retrieve_user_context(uuid, vector(1024), integer, text[]);

-- ============================================================
-- 3. 重建 user_embeddings 表（1024 维）
-- ============================================================
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
    -- 向量嵌入（1024 维，智谱 embedding-3 降维输出）
    embedding vector(1024) not null,
    -- 嵌入生成时间
    embedded_at timestamptz not null default now(),
    -- 唯一约束：同一用户同一来源不重复嵌入
    unique(user_id, source_type, source_id)
);

-- 4. 索引
create index if not exists idx_user_embeddings_user_id on public.user_embeddings(user_id);
create index if not exists idx_user_embeddings_source_type on public.user_embeddings(source_type);
-- HNSW 向量索引（cosine distance，性能优于 ivfflat）
-- m=16, ef_construction=64 — Supabase 推荐参数
create index if not exists idx_user_embeddings_embedding
    on public.user_embeddings
    using hnsw (embedding vector_cosine_ops)
    with (m = 16, ef_construction = 64);

-- 5. RLS 策略
alter table public.user_embeddings enable row level security;

drop policy if exists "Users can read own embeddings" on public.user_embeddings;
create policy "Users can read own embeddings"
    on public.user_embeddings for select
    to authenticated
    using (user_id = auth.uid());

-- 6. 注释
comment on table public.user_embeddings is 'RAG 向量库 — 用户的冲动消费/收据/聊天历史向量化，用于 AI 检索用户上下文（1024 维，智谱 embedding-3 降维）';
comment on column public.user_embeddings.source_type is 'impulse_event=冲动事件 / email_receipt=购物收据 / chat_message=聊天消息';
comment on column public.user_embeddings.embedding is '智谱 embedding-3 向量，1024 维（API 调用时指定 dimensions=1024，HNSW 兼容）';

-- ============================================================
-- 7. 检索函数：retrieve_user_context（1024 维）
-- ============================================================
create or replace function public.retrieve_user_context(
    p_user_id uuid,
    p_query_embedding vector(1024),
    p_top_k integer default 5,
    p_source_types text[] default null
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

-- 7.1 撤销 anon 执行权限（BUG-204 风格）
revoke execute on function public.retrieve_user_context(uuid, vector(1024), integer, text[]) from anon;
grant execute on function public.retrieve_user_context(uuid, vector(1024), integer, text[]) to authenticated, service_role;

comment on function public.retrieve_user_context is 'RAG 检索：给定 user_id + query 向量，返回 top-K 最相关记录（cosine similarity，1024 维）';
