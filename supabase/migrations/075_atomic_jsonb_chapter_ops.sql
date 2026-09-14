-- 075: Atomic JSONB operations for butterfly chapters — eliminate read-modify-write conflicts
--
-- 🔧 409 根因修复 (从第一性原理):
--
-- 问题本质: 三处代码对同一个 chapters JSONB 列做 read-modify-write:
--   1. persistIllustrationUrl: 读 chapters → 改 chapters[idx].illustrationUrl → 写回
--   2. persistSceneIllustrations: 读 chapters → 改 chapters[idx].sceneIllustrations → 写回
--   3. story API: 读 chapters → 追加新章节 → 写回
--
-- 这三个操作的 read 和 write 之间有时间差, 互相覆盖 (lost update)。
-- 旧方案: 乐观锁 (.eq('updated_at')) + 合并 — 复杂且仍可能失败。
--
-- 优雅方案: 用 PostgreSQL 原生 JSONB 原子操作, 消除 read-modify-write:
--   - jsonb_set: 原子更新单个字段 (illustrationUrl / sceneIllustrations)
--   - || (concatenation): 原子追加章节到数组末尾
--
-- 这两个操作都是单条 SQL, DB 层面原子执行, 不需要先 SELECT。
-- 不同操作更新 JSONB 的不同部分, 天然不冲突。
-- 不需要乐观锁, 不需要合并, 不需要 updated_at 检查。

-- ============================================================
-- 1. set_chapter_field — 原子更新指定章节的指定字段
--    用 jsonb_set 实现, 不需要 read-modify-write
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_chapter_field(
  p_session_id    UUID,
  p_chapter_index INTEGER,
  p_field_name    TEXT,
  p_field_value   JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chapters JSONB;
  v_idx INTEGER := -1;
  v_i INTEGER;
BEGIN
  -- Lock row (FOR UPDATE 防止并发 append_chapter 期间被修改)
  SELECT chapters INTO v_chapters FROM public.butterfly_sessions
  WHERE id = p_session_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_chapters := COALESCE(v_chapters, '[]'::jsonb);

  -- 找到指定 chapter_index 的数组位置
  FOR v_i IN 0..jsonb_array_length(v_chapters) - 1 LOOP
    IF (v_chapters -> v_i ->> 'index')::int = p_chapter_index THEN
      v_idx := v_i;
      EXIT;
    END IF;
  END LOOP;

  IF v_idx = -1 THEN
    -- 章节不存在 — 调用方应在章节保存后再持久化插图
    RETURN false;
  END IF;

  -- 原子更新: jsonb_set 只改指定字段, 不影响其他字段
  v_chapters := jsonb_set(
    v_chapters,
    ARRAY[v_idx::text, p_field_name],
    p_field_value
  );

  UPDATE public.butterfly_sessions
  SET chapters = v_chapters
  WHERE id = p_session_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_chapter_field(UUID, INTEGER, TEXT, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_chapter_field(UUID, INTEGER, TEXT, JSONB) TO service_role;

COMMENT ON FUNCTION public.set_chapter_field(UUID, INTEGER, TEXT, JSONB) IS
  'Atomic field-level update on chapters JSONB — eliminates read-modify-write conflicts with append_chapter';

-- ============================================================
-- 2. append_chapter — 原子追加章节 + 更新 current_chapter + choices
--    用 jsonb || 追加, 不需要 read-modify-write
-- ============================================================
CREATE OR REPLACE FUNCTION public.append_chapter(
  p_session_id      UUID,
  p_chapter         JSONB,
  p_current_chapter INTEGER,
  p_choices         JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chapters JSONB;
  v_existing_choices JSONB;
  v_merged_choices JSONB;
  v_chapter_index INTEGER;
  v_idx INTEGER := -1;
  v_i INTEGER;
BEGIN
  -- Lock row
  SELECT chapters, choices INTO v_chapters, v_existing_choices
  FROM public.butterfly_sessions
  WHERE id = p_session_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session not found');
  END IF;

  v_chapters := COALESCE(v_chapters, '[]'::jsonb);
  v_chapter_index := (p_chapter ->> 'index')::int;

  -- 检查章节是否已存在 (幂等: 已存在则跳过追加, 只更新内容)
  FOR v_i IN 0..jsonb_array_length(v_chapters) - 1 LOOP
    IF (v_chapters -> v_i ->> 'index')::int = v_chapter_index THEN
      v_idx := v_i;
      EXIT;
    END IF;
  END LOOP;

  IF v_idx >= 0 THEN
    -- 章节已存在: 用 jsonb_set 更新内容, 保留已有的 illustrationUrl
    -- 保留 illustrationUrl / sceneIllustrations (如果新章节没有)
    v_chapters := jsonb_set(v_chapters, ARRAY[v_idx::text], p_chapter || jsonb_build_object(
      'illustrationUrl', COALESCE(p_chapter -> 'illustrationUrl', v_chapters -> v_idx -> 'illustrationUrl'),
      'sceneIllustrations', COALESCE(p_chapter -> 'sceneIllustrations', v_chapters -> v_idx -> 'sceneIllustrations')
    ));
  ELSE
    -- 章节不存在: 追加到末尾 (|| 原子操作)
    v_chapters := v_chapters || jsonb_build_array(p_chapter);
  END IF;

  -- 合并 choices (如果传入)
  IF p_choices IS NOT NULL THEN
    v_merged_choices := COALESCE(v_existing_choices, '[]'::jsonb);
    -- 追加新 choices (去重 by id)
    FOR v_i IN 0..jsonb_array_length(p_choices) - 1 LOOP
      DECLARE
        v_new_choice JSONB := p_choices -> v_i;
        v_new_id TEXT := v_new_choice ->> 'id';
        v_found BOOLEAN := false;
      BEGIN
        FOR v_j IN 0..jsonb_array_length(v_merged_choices) - 1 LOOP
          IF (v_merged_choices -> v_j ->> 'id') = v_new_id THEN
            v_found := true;
            EXIT;
          END IF;
        END LOOP;
        IF NOT v_found THEN
          v_merged_choices := v_merged_choices || jsonb_build_array(v_new_choice);
        END IF;
      END;
    END LOOP;
  ELSE
    v_merged_choices := v_existing_choices;
  END IF;

  -- 单次 UPDATE: chapters + current_chapter + choices
  UPDATE public.butterfly_sessions
  SET chapters = v_chapters,
      current_chapter = p_current_chapter,
      choices = v_merged_choices
  WHERE id = p_session_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.append_chapter(UUID, JSONB, INTEGER, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_chapter(UUID, JSONB, INTEGER, JSONB) TO service_role;

COMMENT ON FUNCTION public.append_chapter(UUID, JSONB, INTEGER, JSONB) IS
  'Atomic chapter append + current_chapter + choices update — eliminates read-modify-write conflicts with set_chapter_field';
