-- ============================================================
-- 033: Auto-expire active challenges after 30 minutes
-- ============================================================
-- 问题: active 状态的挑战如果用户/AI 从不调 complete_challenge, 会永远卡在 active
--   唯一索引 active_challenges_user_active_uniq 会拒绝第二个 active, 卡死用户新建挑战
--   createChallenge 会先把旧 active 标 expired, 但如果用户不新建而是直接聊天,
--   context header 会注入过期的 challengeId
--
-- 修复: 加 trigger, 任何查询/更新 active_challenges 时先把 30 分钟前的 active 标 expired
--   + getActiveChallenge 查询也加 30 分钟过滤 (应用层双保险)
--
-- 设计:
--   - 30 分钟足够用户完成挑战对话 (AI 通常 2-3 轮回复内判断 passed/failed)
--   - 过期后 active_challenges_user_active_uniq 释放, 用户可新建挑战
--   - 过期记录保留 30 天供审计 (见 migration 034 pg_cron 清理)
-- ============================================================

-- 1. 创建自动过期函数
--    在 INSERT/UPDATE 时检查, 把同用户 30 分钟前的 active 记录标 expired
--    注意: 用 AFTER INSERT/UPDATE 而非 BEFORE, 避免递归
CREATE OR REPLACE FUNCTION public.expire_stale_active_challenges()
RETURNS TRIGGER AS $$
BEGIN
  -- 把当前用户 24 小时前的 active 记录标 expired (排除当前记录)
  -- 挑战模式 UI 分离后, 用户明确知道在挑战中, 不需要 30 分钟激进过期
  -- 24 小时覆盖"睡一觉回来继续"的真实场景
  UPDATE public.active_challenges
  SET status = 'expired'
  WHERE user_id = NEW.user_id
    AND status = 'active'
    AND id != NEW.id
    AND created_at < NOW() - INTERVAL '24 hours';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. 绑定 trigger 到 INSERT
DROP TRIGGER IF EXISTS trg_expire_stale_challenges_insert ON public.active_challenges;
CREATE TRIGGER trg_expire_stale_challenges_insert
  AFTER INSERT ON public.active_challenges
  FOR EACH ROW
  EXECUTE FUNCTION public.expire_stale_active_challenges();

-- 3. 绑定 trigger 到 UPDATE (status 变化时检查)
DROP TRIGGER IF EXISTS trg_expire_stale_challenges_update ON public.active_challenges;
CREATE TRIGGER trg_expire_stale_challenges_update
  AFTER UPDATE OF status ON public.active_challenges
  FOR EACH ROW
  WHEN (OLD.status = 'active' AND NEW.status = 'active')
  EXECUTE FUNCTION public.expire_stale_active_challenges();

COMMENT ON FUNCTION public.expire_stale_active_challenges() IS 'P3 fix: auto-expire active challenges older than 30 minutes';
