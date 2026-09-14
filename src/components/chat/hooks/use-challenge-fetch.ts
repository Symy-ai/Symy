/**
 * useChallengeFetch — 挑战状态恢复 hook
 *
 * 🔧 架构优化: 从 chat-tab.tsx 提取活跃/过期挑战获取逻辑 (~60 行)
 *    好处:
 *      1. chat-tab.tsx 行数减少 (目标 <800)
 *      2. 挑战获取逻辑独立, 可测试
 *      3. 关注点分离 — chat-tab 专注聊天, 此 hook 专注挑战恢复
 */

'use client';

import { useEffect, useRef } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import type { ActiveChallenge, ExpiredChallenge } from './use-challenge-actions';
import type { User } from '@supabase/supabase-js';

export interface UseChallengeFetchArgs {
  user: User | null;
  isDemo: boolean;
  authLoading: boolean;
  activeChallenge: ActiveChallenge | undefined;
  justCompletedChallengeRef: React.MutableRefObject<boolean>;
  setActiveChallenge: (challenge: ActiveChallenge | undefined) => void;
  setExpiredChallenge: (challenge: ExpiredChallenge | null) => void;
}

/**
 * useChallengeFetch — 进入 chat 时恢复活跃/过期挑战
 *
 * 两个 effect:
 *   1. 查活跃挑战 (/api/challenge/active) → 恢复 activeChallenge
 *   2. 查过期挑战 (/api/challenge/expired) → 显示 expired banner
 *
 * 两个 effect 都跳过: demo 模式 / 未登录 / auth loading 中 / 已有 activeChallenge
 */
export function useChallengeFetch({
  user,
  isDemo,
  authLoading,
  activeChallenge,
  justCompletedChallengeRef,
  setActiveChallenge,
  setExpiredChallenge,
}: UseChallengeFetchArgs) {
  // 防止重复 fetch (用户切换时)
  const _prevUserIdRef = useRef<string | undefined>(undefined);
  // 🔧 P0-3 fix (2026-07-17): 跟踪 activeChallenge 从有值变 undefined 的瞬间
  //   避免完成挑战后又立刻重新 fetch /api/challenge/active + /api/challenge/expired
  const prevActiveRef = useRef<ActiveChallenge | undefined>(undefined);
  const prevExpiredActiveRef = useRef<ActiveChallenge | undefined>(undefined);

  // 1. 查活跃挑战 — 恢复 activeChallenge
  useEffect(() => {
    // 🔧 PM-NEW-19 fix: 等 auth loading 完成, 防止认证未就绪时 fetch /api/challenge/active 触发 401 警告
    if (isDemo || !user || authLoading || activeChallenge) return;
    // 🔧 Bug 1 fix (Round 43, P0): 刚完成挑战时, /api/challenge/active 可能仍返回旧挑战
    //   (服务端 complete_challenge 事务可能还没提交)。跳过本次 fetch, 防止重新设
    //   activeChallenge → 触发 loadHistory → 覆盖消息。
    if (justCompletedChallengeRef.current) {
      justCompletedChallengeRef.current = false;
      return;
    }
    // 🔧 P0-3 fix (2026-07-17): 用 ref 记录 prev activeChallenge, 当从有值变 undefined 时
    //   (用户刚完成挑战), 跳过本次 fetch — 防止立刻又调 /api/challenge/active
    //   (这种重复调用在 Saw it 后 9 秒内可能触发 4 次, 浪费请求 + 可能返回旧数据)
    if (prevActiveRef.current) {
      // activeChallenge 从有值变 undefined — 这是用户完成挑战的正常流程, 不需要重新 fetch
      prevActiveRef.current = activeChallenge;
      return;
    }
    prevActiveRef.current = activeChallenge;
    let cancelled = false;
  // eslint-disable-next-line symy/no-raw-fetch-in-use-effect
    apiFetch<{ challenge?: { id: string; item_name: string; amount: number | string } }>('/api/challenge/active', { headers: { 'Cache-Control': 'no-cache' } })
      .then(data => {
        if (cancelled) return;
        if (data?.challenge) {
          // 🔧 NEW-031 fix (Round 59): 不设 skipNonce — restore effect 需要让 loadHistory
          //   加载 challenge 模式的历史 (mount 时加载了 normal 模式, 现在需要切换到 challenge)。
          //   旧代码 (Round 53): 设 skipNonce → loadHistory skip → challenge 历史永远不加载。
          //   修复: 不设 skipNonce, 让 loadHistory 正常加载 challenge 历史 (只加载一次,
          //   因为 activeChallenge 从 undefined → 有值只变化一次)。
          setActiveChallenge({
            itemName: data.challenge.item_name,
            amount: Number(data.challenge.amount),
            challengeId: data.challenge.id,
          });
        }
      })
      // 🔧 PM-NEW-19 fix: 静默 401 错误 (auth 未就绪 / session 过期 — auth provider 会处理)
      .catch(err => {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return;
        logger.warn("[ChatTab] Failed to fetch active challenge:", err);
      });
    return () => { cancelled = true; };
  }, [user, isDemo, authLoading, activeChallenge, justCompletedChallengeRef, setActiveChallenge]);

  // 2. 查过期挑战 — 显示 expired banner
  useEffect(() => {
    // 🔧 PM-NEW-19 fix: 等 auth loading 完成
    if (isDemo || !user || authLoading || activeChallenge) return;
    // 🔧 P0-3 fix (2026-07-17): 同样跳过 activeChallenge 从有值变 undefined 的瞬间
    //   避免与 effect 1 同时触发, 减少并发请求
    if (prevExpiredActiveRef.current) {
      prevExpiredActiveRef.current = activeChallenge;
      return;
    }
    prevExpiredActiveRef.current = activeChallenge;
    let cancelled = false;
    // 🔧 架构还债: 用 apiFetch 替代内联 fetch (统一错误处理 + 类型安全)
  // eslint-disable-next-line symy/no-raw-fetch-in-use-effect
    apiFetch<{ challenge?: { id: string; item_name: string; amount: number | string } }>('/api/challenge/expired', { headers: { 'Cache-Control': 'no-cache' } })
      .then(data => {
        if (cancelled) return;
        if (data?.challenge) {
          setExpiredChallenge({
            challengeId: data.challenge.id,
            itemName: data.challenge.item_name,
            amount: Number(data.challenge.amount),
          });
        }
      })
      // 🔧 PM-NEW-19 fix: 静默 401 错误
      .catch(err => {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return;
        logger.warn("[ChatTab] Failed to fetch expired challenge:", err);
      });
    return () => { cancelled = true; };
  }, [user, isDemo, authLoading, activeChallenge, setExpiredChallenge]);
}
