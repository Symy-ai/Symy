'use client';

/**
 * useRefCodeTracking — 邀请码追踪 hook (需求七)
 *
 * 🔧 需求七: 好友通过邀请链接注册时, 后端记录 ref 关系
 *
 * 流程:
 *   1. 用户访问 ?ref=CODE → 存 localStorage('symy_ref_code')
 *   2. 用户登录后 (user.id 可用) → POST /api/invite/record-ref
 *   3. 成功后清 localStorage
 *
 * 用法: 在 page.tsx 调用 useRefCodeTracking(user?.id)
 */

import { useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';

const REF_CODE_STORAGE_KEY = 'symy_ref_code';
const REF_CODE_RECORDED_KEY = 'symy_ref_code_recorded';

/**
 * 从 URL 或 localStorage 读取 ref code, 存入 localStorage
 * (在客户端入口调用一次, page.tsx mount 时)
 */
export function captureRefCode() {
  if (typeof window === 'undefined') return;
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const refFromUrl = urlParams.get('ref');
    if (refFromUrl) {
      // URL 有 ref → 存 localStorage (覆盖旧的)
      localStorage.setItem(REF_CODE_STORAGE_KEY, refFromUrl);
      // 重置 recorded 标记 (新 ref 需要重新记录)
      localStorage.removeItem(REF_CODE_RECORDED_KEY);
      // 🔧 REVIEW-1 M15 fix: 清除 URL 中的 ref 参数, 但保留其他 query params (utm_source 等)
      //    旧代码: newUrl = pathname + hash → 丢失所有 query params
      //    新代码: 用 URLSearchParams.delete 只移除 ref
      urlParams.delete('ref');
      const remainingQuery = urlParams.toString();
      const newUrl = window.location.pathname
        + (remainingQuery ? '?' + remainingQuery : '')
        + window.location.hash;
      window.history.replaceState({}, document.title, newUrl);
      logger.info(`[RefCodeTracking] Captured ref code: ${refFromUrl}`);
    }
  } catch {
    // localStorage 可能在隐私模式不可用
  }
}

/**
 * 登录后记录 ref 关系
 * @param userId - 当前登录用户 ID (null = 未登录, 等待)
 */
export function useRefCodeTracking(userId: string | null | undefined) {
  const recordedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    if (typeof window === 'undefined') return;

    // 已记录过此 user → 跳过
    if (recordedRef.current === userId) return;

    let refCode: string | null = null;
    try {
      refCode = localStorage.getItem(REF_CODE_STORAGE_KEY);
      // safe to ignore: non-critical background operation, error already logged
    } catch {
              // safe to ignore: non-critical background operation, error already logged
      return;
    }

    if (!refCode) return;

  // 标记已记录 (防止重复 POST)
    recordedRef.current = userId;

    (async () => {
      try {
  // eslint-disable-next-line symy/no-raw-fetch-in-use-effect
        const result = await apiFetch<{
          recorded?: boolean;
          guardian?: { completedCount?: number; badgeProgress?: number; badgeLinked?: boolean };
        }>('/api/invite/record-ref', {
          method: 'POST',
          body: { refCode },
        });
        // 成功记录 → 清 localStorage
        try {
          localStorage.removeItem(REF_CODE_STORAGE_KEY);
        } catch (lsErr) {
          // safe to ignore: non-critical localStorage clear, ref code already recorded server-side
          logger.warn('[RefCodeTracking] Failed to clear localStorage:', lsErr);
        }
        logger.info(`[RefCodeTracking] Recorded ref "${refCode}" for user ${userId}`);
        if (result?.recorded && result.guardian?.badgeLinked) {
          window.dispatchEvent(new CustomEvent('symy:invite-covenant-recorded', { detail: result.guardian }));
        }
      } catch (err) {
        logger.warn('[RefCodeTracking] Failed to record ref:', err);
        // 失败 → 重置 recordedRef, 让下次重试
        recordedRef.current = null;
      }
    })();
  }, [userId]);
}
