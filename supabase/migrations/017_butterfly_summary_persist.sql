-- ============================================================
-- 017_butterfly_summary_persist.sql
-- 蝴蝶效应人生剧情系统 — 持久化蝴蝶效应总结
-- C2 fix: 保存 AI 生成的蝴蝶效应总结到数据库，
-- 避免用户刷新后丢失个性化总结文本
-- ============================================================

-- 添加 butterfly_effect 字段存储 AI 生成的总结
ALTER TABLE butterfly_sessions
ADD COLUMN IF NOT EXISTS butterfly_effect TEXT;

-- 添加最终基调字段（冗余存储，方便查询）
ALTER TABLE butterfly_sessions
ADD COLUMN IF NOT EXISTS final_tone TEXT CHECK (final_tone IN ('hopeful', 'neutral', 'dark', 'twist'));
