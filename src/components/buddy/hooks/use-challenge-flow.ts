'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useI18n } from '@/i18n/provider';
import { logger } from '@/lib/logger';
import { useChallengeLimit } from '@/hooks/use-challenge-limit';
// ChallengeContext 单一 source of truth
import type { ChallengeContext } from '@/types/challenge-context';

type NavigateChat = (context?: { type: 'challenge' | 'healing' | 'default'; message?: string; challengeContext?: ChallengeContext }) => void;

interface UseChallengeFlowArgs {
  isDemo: boolean;
  userId?: string;
  onNavigateChat: NavigateChat;
  onToast?: (message: string, type?: 'success' | 'info') => void;
  /** BUG-131 fix: 共享 pulse timer refs (与 healing pulse 共用, 卸载时统一清理) */
  pulseTimerRefs: { current: ReturnType<typeof setTimeout>[] };
  /** 次数用完时打开代币兑换对话框 (state 在 use-redeem-dialog) */
  openRedeemDialog: (type: 'see_it' | 'gacha') => void;
}

/**
 * Challenge 全生命周期: 活跃挑战缓存/预查 → "See it" 按钮 → 创建挑战 → 导航到 Chat
 * (原为 buddy-tab.tsx 内联逻辑 — File Split Wave 1 纯搬运, 行为零变化)
 */
export function useChallengeFlow({ isDemo, userId, onNavigateChat, onToast, pulseTimerRefs, openRedeemDialog }: UseChallengeFlowArgs) {
  const { t } = useI18n();
  // Challenge 弹窗状态
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const handleCloseChallengeModal = useCallback(() => setShowChallengeModal(false), []);
  const { canStartChallenge, limitData: challengeLimitData, refresh: refreshChallengeLimit } = useChallengeLimit(isDemo);
  // 加 loading 状态 + 缓存 TTL, 让按钮点击有即时反馈
  const [isCheckingChallenge, setIsCheckingChallenge] = useState(false);
  const cachedChallengeRef = useRef<{ data: { id: string; item_name: string; amount: number } | null; ts: number }>({ data: null, ts: 0 });
  const CHALLENGE_CACHE_TTL = 5000; // 5s 缓存
  const prefetchPromiseRef = useRef<Promise<{ id: string; item_name: string; amount: number } | null> | null>(null);
  // 🔧 2026-07-15 fix: "I'm back" 消息去重 — 同一 challengeId 在同一页面 session 内只发一次
  const sentBackMessageRef = useRef<Set<string>>(new Set());
  const [challengePulse, setChallengePulse] = useState(false);

  // challenge_id 会注入到 /api/chat context header, AI 调 complete_challenge 时只需传 challenge_id + status
  const startChallenge = async (itemName: string, amount: number) => {
    setShowChallengeModal(false);
    const trimmedName = itemName.trim();

    //   旧文案: "I want to buy X for $Y. Challenge me!" (工具哲学, 命令 AI)
    //   新文案: "I'm moved by X · $Y · Let me see it" (镜子哲学, 邀请守护)
    // 🔧 F2 fix: 根据 locale 本地化用户消息 (旧代码硬编码英文)
    const mirrorMsg = t('chat.mirrorMessage', {
      defaultValue: `I'm thinking of buying ${trimmedName} — Symy, what's your take?`,
      item: trimmedName,
      amount: `$${amount.toFixed(2)}`,
    });

    // Demo 模式不调 API，直接用临时 challengeId
    if (isDemo) {
      onNavigateChat({
        type: 'challenge',
        message: mirrorMsg,
        challengeContext: { itemName: trimmedName, amount, challengeId: `demo-${Date.now()}` },
      });
      return;
    }

    try {
      const data = await apiFetch<{ challengeId?: string; error?: string }>('/api/challenge/create', {
        method: 'POST',
        body: { itemName: trimmedName, amount },
      });
      if (!data.challengeId) {
        throw new Error(data.error || 'Failed to create challenge');
      }
      //    打开 modal 让用户创建第二个 challenge (服务端会把第一个标 expired)。
      cachedChallengeRef.current = {
        data: { id: data.challengeId, item_name: trimmedName, amount },
        ts: Date.now(),
      };
      // 🔧 2026-07-15 fix: 新 challenge 创建时清空去重 ref (旧 challenge 的 id 不再需要追踪)
      sentBackMessageRef.current.clear();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('symy:challenge-created'));
      }
      onNavigateChat({
        type: 'challenge',
        message: mirrorMsg,
        challengeContext: { itemName: trimmedName, amount, challengeId: data.challengeId },
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        logger.info('[BuddyTab] Challenge daily limit reached (429)');
        onToast?.(t('buddy.challengeLimitReached', { defaultValue: "You've seen 5 times today. Come back tomorrow — or Premium for unlimited." }), 'info');
        refreshChallengeLimit();
        return;
      }
      // 失败时降级: 不带 challengeId, 仍能走旧路径 (AI 传 challenge_type + saved_amount)
      logger.warn('[BuddyTab] Failed to create challenge, falling back to legacy mode:', err);
      onNavigateChat({
        type: 'challenge',
        message: mirrorMsg,
        challengeContext: { itemName: trimmedName, amount },
      });
    }
  };

  // 组件挂载时预查活跃挑战 (供 Challenge 按钮同步检查)
  // 预查结果必须写入 cachedChallengeRef (按钮 onClick 读的是 ref, 不是 state)
  // 移除 dynamic import, 用静态 import 加速预查
  //    → 用户在预查完成前点击 → ref 仍为 {data:null, ts:0} → 走 async fetch → 用户感知"没反应"
  useEffect(() => {
    if (isDemo) return;
    if (!userId) return;
    let cancelled = false;
  // eslint-disable-next-line symy/no-raw-fetch-in-use-effect
    prefetchPromiseRef.current = apiFetch<{ challenge?: { id: string; item_name: string; amount: number } }>('/api/challenge/active')
      .then(data => {
        const challenge = data?.challenge || null;
        if (!cancelled) {
          cachedChallengeRef.current = { data: challenge, ts: Date.now() };
          prefetchPromiseRef.current = null; // 🔧 BUG-5 fix (Round 59): 只在未取消时清理 ref
        }
        return challenge;
      })
      .catch(() => {
        if (!cancelled) {
          cachedChallengeRef.current = { data: null, ts: 0 };
          prefetchPromiseRef.current = null; // 🔧 BUG-5 fix (Round 59): 只在未取消时清理 ref
        }
        return null;
      });
    return () => { cancelled = true; };
  }, [isDemo, userId]);

  // Clear challenge cache on user switch
  const prevBuddyUserIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevBuddyUserIdRef.current !== undefined && prevBuddyUserIdRef.current !== userId) {
      cachedChallengeRef.current = { data: null, ts: 0 };
    }
    prevBuddyUserIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    const handler = () => setShowChallengeModal(true);
    window.addEventListener('symy:open-challenge-modal', handler);
    return () => window.removeEventListener('symy:open-challenge-modal', handler);
  }, []);

  const handleSeeItClick = async () => {
    // 缓存 TTL + loading 状态 + 静态 import
    //    1. 5s TTL 缓存: 首次点击 async fetch + loading spinner; 5s 内再点击用缓存 (同步导航)
    //    2. loading 状态: 按钮 disabled + spinner, 用户知道"正在检查"
    //    3. 静态 import apiFetch (预热模块)
    if (!isDemo) {
      // 检查缓存
      const cached = cachedChallengeRef.current;
      const cacheAge = Date.now() - cached.ts;
      if (cacheAge < CHALLENGE_CACHE_TTL) {
        // 缓存有效 — 同步路径
        if (cached.data) {
          const challengeId = cached.data.id;
          const alreadySent = sentBackMessageRef.current.has(challengeId);
          onNavigateChat({
            type: 'challenge',
            // 🔧 2026-07-15 fix: 同一 challenge 只发一次 "I'm back", 重复点击只导航不发消息
            //   用 undefined (而非 '') 让 page.tsx 的 `||` fallback 不触发
            // 🔧 P1-2.1 fix (2026-07-21): i18n — 旧代码硬编码英文 "I'm back — let's continue..."
            ...(alreadySent ? {} : { message: t('buddy.challengeResumeMessage', { defaultValue: "I'm back — let's continue the challenge about {itemName}", itemName: cached.data.item_name }) }),
            challengeContext: { itemName: cached.data.item_name, amount: Number(cached.data.amount), challengeId },
          });
          if (!alreadySent) {
            sentBackMessageRef.current.add(challengeId);
          }
          onToast?.(t('buddy.challengeAlreadyActive', { defaultValue: 'You already have an active challenge. Continue it?' }), 'info');
          return;
        }
        // 缓存有效但无活跃挑战 → 直接打开 modal
        if (!canStartChallenge()) {
          onToast?.(t('buddy.challengeLimitReached', { defaultValue: "You've seen 5 times today. Come back tomorrow — or Premium for unlimited." }), 'info');
          return;
        }
        setChallengePulse(true);
        const tid = setTimeout(() => {
          setChallengePulse(false);
          pulseTimerRefs.current = pulseTimerRefs.current.filter(t => t !== tid);
        }, 400);
        pulseTimerRefs.current.push(tid);
        setShowChallengeModal(true);
        return;
      }

      // 缓存过期 — async fetch + loading
      setIsCheckingChallenge(true);
      try {
        let activeChallenge: { id: string; item_name: string; amount: number } | null;
        if (prefetchPromiseRef.current) {
          // Prefetch 还在 in-flight, await 同一个 promise (不浪费请求)
          activeChallenge = await prefetchPromiseRef.current;
        } else {
          // Prefetch 已完成 (或未发起), 发起新 fetch
          const data = await apiFetch<{ challenge?: { id: string; item_name: string; amount: number } }>('/api/challenge/active');
          activeChallenge = data?.challenge || null;
          cachedChallengeRef.current = { data: activeChallenge, ts: Date.now() };
        }

        if (activeChallenge) {
          const challengeId = activeChallenge.id;
          const alreadySent = sentBackMessageRef.current.has(challengeId);
          onNavigateChat({
            type: 'challenge',
            // 🔧 P1-2.1 fix (2026-07-21): i18n — 旧代码硬编码英文
            ...(alreadySent ? {} : { message: t('buddy.challengeResumeMessage', { defaultValue: "I'm back — let's continue the challenge about {itemName}", itemName: activeChallenge.item_name }) }),
            challengeContext: { itemName: activeChallenge.item_name, amount: Number(activeChallenge.amount), challengeId },
          });
          if (!alreadySent) {
            sentBackMessageRef.current.add(challengeId);
          }
          onToast?.(t('buddy.challengeAlreadyActive', { defaultValue: 'You already have an active challenge. Continue it?' }), 'info');
          return;
        }
      } catch (err) {
        //    → fetch 失败 (网络/401) 时缓存 null, 5s TTL 内用户再点 Challenge 按钮 →
        //    命中 null 缓存 → 直接打开 modal 让用户创建第二个 challenge (服务端把第一个
        //    标 expired, AI 上下文断裂)。
        logger.warn('[BuddyTab] Failed to check active challenge:', err);
        onToast?.(t('buddy.challengeCheckFailed', { defaultValue: 'Couldn\'t check active challenges. Please try again.' }), 'info');
        return;
      } finally {
        setIsCheckingChallenge(false);
      }
    }
    // 无活跃挑战 (或 demo) → 打开 Challenge modal
    if (!canStartChallenge()) {
      openRedeemDialog('see_it');
      return;
    }
    setChallengePulse(true);
    // BUG-131 fix: 追踪 timer 以便卸载时清理
    const tid = setTimeout(() => {
      setChallengePulse(false);
      // 清理已完成的 timer 引用，防止数组无限增长
      pulseTimerRefs.current = pulseTimerRefs.current.filter(t => t !== tid);
    }, 400);
    pulseTimerRefs.current.push(tid);
    // 打开 Challenge 弹窗，让用户输入要买什么
    setShowChallengeModal(true);
  };

  return { showChallengeModal, handleCloseChallengeModal, isCheckingChallenge, challengePulse, challengeLimitData, handleSeeItClick, startChallenge };
}
