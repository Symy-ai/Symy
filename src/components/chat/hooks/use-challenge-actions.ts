'use client';

/**
 * useChallengeActions — 挑战模式操作 handlers
 *
 * 从 chat-tab.tsx 抽出 (C4 拆分).
 * 包含: handleGiveUp, handleResume, handleDismiss
 *
 * 行为零变化: 纯函数提取, 不改逻辑.
 */

import { useCallback, useRef, useEffect } from 'react';
import { apiFetch, apiFetchVoid } from '@/lib/api-client';
import type { useI18n } from '@/i18n/provider';
import { logger } from '@/lib/logger';
import { DEFAULT_HOURLY_RATE } from '@/lib/freedom-time';
import { symyEvents } from '@/lib/posthog';
// 🔧 ARCH fix (Round 56 R56-Bug8): 用共享 getChallengeTypeLabelByAmount 替代内联阈值
import { getChallengeTypeLabelByAmount } from '@/lib/challenge-rules';
import type { ChatMessage } from '@/components/chat-bubble';
// 🔧 ARCH fix (Round 8 AUDIT-3 P0 #3): ActiveChallenge 与 ChallengeContext 形状一致, 复用 canonical type
import type { ChallengeContext } from '@/types/challenge-context';
// 🏅 拦截勋章 (绿色转向): "I'll pass" 直连完成路径派发勋章事件 (AI 可能不再调 complete_challenge)
import { dispatchInterceptMedal } from '@/lib/intercept-medal';
// 🐘 人设转型 (2026-09-05): toast 文案改用小象话术库 (SSOT), 不再动既有 i18n key
import { elephantHours, elephantMoney, getElephantPhrase } from '@/lib/elephant-tone';

/**
 * 客户端活跃挑战上下文 — 与 ChallengeContext 等价
 * (保留旧名兼容现有 import; 新代码应直接用 ChallengeContext)
 */
export type ActiveChallenge = ChallengeContext;

export interface ExpiredChallenge {
  challengeId: string;
  itemName: string;
  amount: number;
}

export interface ChallengeActionsArgs {
  // State setters
  setActiveChallenge: (challenge: ActiveChallenge | undefined) => void;
  setExpiredChallenge: (challenge: ExpiredChallenge | null) => void;
  setMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  skipNextHistoryLoadRef: React.MutableRefObject<boolean>;
  // 🔧 Aha Moment: 挑战通过后触发存入弹窗 / Aha Moment Step 3
  onChallengePassed?: (challenge: { challengeId: string; itemName: string; amount: number }) => void;
  // 🔧 DM-5 fix: handleGiveUp 路径也触发 DepositDialog (之前只有 AI stream 路径触发)
  onChallengeCompleted?: (challengeId: string, savedAmount: number) => void;
  // 🔧 需求九: handleChooseToBuy 路径触发沉默时刻 (bought), 无存款对话框
  onChallengeBought?: (amount: number, itemName: string) => void;
  // Send message function
  // 🔧 P0 fix (mirror philosophy): isBuyPath 参数 — true 表示来自 handleChooseToBuy,
  //   sendMessage 入口设 justBoughtChallengeRef.current=true (跳过存款对话框 + passed toast)
  sendMessage: (content: string, apiContent?: string, overrideChallengeContext?: ActiveChallenge, isBuyPath?: boolean, actionType?: 'saw_it' | 'chose_to_buy' | 'challenge_created') => Promise<void>;
  // Callbacks
  onToast?: (message: string, type?: 'success' | 'info') => void;
  onBuddyStateRefresh?: () => void;
  // i18n
  t: ReturnType<typeof useI18n>['t'];
  // 🐘 人设转型 (2026-09-05): toast 文案从小象话术库取词, 需要 UI 语言
  locale: string;
  // 🔧 P0-3 fix: 用户时薪, 用于 handleResume 中的生命小时数计算 (不再硬编码 /20)
  hourlyRate?: number;
}

export function useChallengeActions({
  setActiveChallenge,
  setExpiredChallenge,
  setMessages,
  skipNextHistoryLoadRef,
  onChallengePassed,
  onChallengeCompleted,
  onChallengeBought,
  sendMessage,
  onToast,
  onBuddyStateRefresh,
  t,
  locale,
  hourlyRate = DEFAULT_HOURLY_RATE,
}: ChallengeActionsArgs) {
  // 🔧 H3 fix: 跟踪 resume setTimeout, 卸载时清理
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 🔧 D2 fix (batch91-b): variable-reward 10s 兜底 setTimeout, 卸载时清理 (与 resumeTimerRef 模式一致)
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 🔧 ARCH fix (Round 17 audit H3+H4 — handleGiveUp/handleResume 双击防护):
  const isGiveUpInProgressRef = useRef(false);
  const isResumeInProgressRef = useRef(false);

  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) {
        clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    };
  }, []);

  /**
   * handleGiveUp — "I'll pass" 按钮
   * 发送 surrender 消息 + 调 /api/challenge/complete (status=passed)
   */
  const handleGiveUp = useCallback(async (challenge: ActiveChallenge) => {
    // 🔧 ARCH fix (Round 17 audit H4 — 双击防护):
    //    旧代码无 in-flight guard, 双击发两条 surrender 消息 + 两次 API 调用。
    if (isGiveUpInProgressRef.current) return;
    isGiveUpInProgressRef.current = true;
    try {
    // BUG-4 FIX: Give Up button sends surrender message with explicit challenge context
    // 🔧 BUG-013 fix: 直接调 /api/challenge/complete + 显示 toast (不依赖 AI 是否可用)
    const savedChallenge = { itemName: challenge.itemName, amount: challenge.amount, challengeId: challenge.challengeId };
    // 🔧 P1-2 fix: 不再伪造用户消息 "You're right. I'll keep the $..."
    //   改为 action 消息 (role='action', 渲染为 "✓ Saw it" 状态徽章)
    //   AI 仍通过 apiContent 收到完整上下文, 能正确回复
    const actionContent = t('chat.challengeSawItAction') || '✓ Saw it';
    const apiActionContent = `[Action: User chose to pass on ${savedChallenge.itemName} ($${savedChallenge.amount.toFixed(2)}). They saw the cost and decided to keep the money.]`;
    setActiveChallenge(undefined);
    // 先发送 action 消息 (让 AI 后续可以继续对话)
    sendMessage(actionContent, apiActionContent, savedChallenge, false, 'saw_it');
    // 直接调 complete_challenge API (不依赖 AI 是否可用)
    if (savedChallenge.challengeId) {
      try {
        // 🔧 P1-1 Variable Reward (Round 92): 用 apiFetch 获取 rewardTier
        const completeResult = await apiFetch<{
          result?: { rewardTier?: 'basic' | 'card' | 'item' | 'golden'; bonusTokens?: number; bonusVitality?: number };
        }>('/api/challenge/complete', {
          method: 'POST',
          body: {
            challengeId: savedChallenge.challengeId,
            status: 'passed',
            itemName: savedChallenge.itemName,
            amount: savedChallenge.amount,
          },
        });
        // 🔧 P1-1: 触发 Variable Reward 动画 (如果有 bonus)
        const tier = completeResult?.result?.rewardTier;
        const hasVariableReward = tier && tier !== 'basic';
        // 🏅 拦截勋章 (绿色转向): passed = 用户没买 = 可晒的勋章。
        //    直连完成路径 AI 可能不再调 complete_challenge, 这里补发;
        //    AI 冗余重调时 lib 内 60s 去重兜底。
        dispatchInterceptMedal({
          itemTitle: savedChallenge.itemName,
          savedCents: Math.round(savedChallenge.amount * 100),
          date: new Date().toISOString(),
        });
        symyEvents.challengeCompleted({
          challengeType: 'resist',
          tokensEarned: completeResult?.result?.bonusTokens ?? 0,
        });
        if (hasVariableReward) {
          // 用 CustomEvent 通知 page.tsx 显示 VariableRewardOverlay
          window.dispatchEvent(new CustomEvent('variable-reward', {
            detail: {
              rewardTier: tier,
              bonusTokens: completeResult?.result?.bonusTokens ?? 0,
              bonusVitality: completeResult?.result?.bonusVitality ?? 0,
            },
          }));
        }
        // 刷新 buddy state (tokens/vitality 可能更新)
        onBuddyStateRefresh?.();
        // 🔧 ARCH fix (Round 19 H3-audit1 — silent API failure):
        //    旧代码: toast 在 API 调用前显示 "Challenge passed! Tokens + vitality awarded."
        //    若 API 失败, 仅 logger.warn → 用户看到成功 toast 但服务器未记录, buddy state 未刷新。
        //    根因修复: API 成功后才显示 awarded toast, 失败时显示 retry toast。
        // 🐘 人设转型: 拦下冲动消费 → 小象恭喜 (荣誉框架, 不是"省钱"说教)
        const toastMsg = getElephantPhrase('saw_it', locale, {
          amount: elephantMoney(savedChallenge.amount),
          hours: elephantHours((savedChallenge.amount / hourlyRate).toFixed(1), locale),
        });
        onToast?.(toastMsg, 'success');
        // 🔧 F7 fix (串行展示): 当有 VariableReward 时, 延迟 onChallengeCompleted (SilentMoment),
        //    等 VariableRewardOverlay.onComplete 触发 'variable-reward-complete' 事件后再开始 SilentMoment。
        //    顺序: BONUS REWARD → Silent moment → 梦想基金引导 (DepositDialog)
        //    无 VariableReward 时 (basic tier), 直接触发 onChallengeCompleted。
        if (onChallengeCompleted && savedChallenge.challengeId) {
          const challengeId = savedChallenge.challengeId;
          const challengeAmount = savedChallenge.amount;
          if (hasVariableReward) {
            // 监听 variable-reward-complete 事件, 一次性触发 onChallengeCompleted
            // 🔧 D2 fix (batch91-b): completed 闭包标志防双调 — 旧代码事件触发后,
            //    10s 兜底仍无条件再调一次 → SilentMoment/存款对话框重复弹。
            //    兜底语义保留: 事件真没触发时 10s 定时器仍救场一次。
            let completed = false;
            const triggerComplete = () => {
              if (completed) return;
              completed = true;
              onChallengeCompleted(challengeId, challengeAmount);
              window.removeEventListener('variable-reward-complete', triggerComplete);
            };
            window.addEventListener('variable-reward-complete', triggerComplete);
            // 安全兜底: 10s 后强制触发 (防止 VariableRewardOverlay 未触发事件);
            // 已被事件触发过时 completed 守卫只清监听不再调用
            fallbackTimerRef.current = setTimeout(() => {
              fallbackTimerRef.current = null;
              triggerComplete();
            }, 10000);
          } else {
            onChallengeCompleted(challengeId, challengeAmount);
          }
        }
        // 🔧 ARCH fix Round 75 (Finding 28): onChallengePassed is now deferred via
        //    onChallengeCompleted → triggerSawSilentMoment → attachPendingAhaMoment →
        //    SilentMomentOverlay.onComplete → onChallengePassed.
        //    旧代码 (Round 34 HIGH-R33-1): 这里同步调 onChallengePassed →
        //    SilentMomentOverlay + AhaMomentOnboarding 同时显示 (UX 冲突).
        //    根因修复: 不再直接调 onChallengePassed; onChallengeCompleted 已包含
        //    attachPendingAhaMoment (见 chat-tab.tsx line 601-616).
        //    (Demo 路径 below 仍直接调 onChallengePassed — Demo 无沉默时刻)
      } catch (err) {
        logger.warn('[ChatTab] Direct complete_challenge failed:', err);
        // 🔧 ARCH fix (Round 19 H3-audit1): API 失败时通知用户, 不静默吞错
        const failToast = t('chat.challengeSaveFailedToast', {
          defaultValue: 'Challenge marked as passed locally, but server save failed. Please retry or refresh.',
        });
        onToast?.(failToast, 'info');
      }
    } else {
      // 无 challengeId (Demo 模式或旧客户端) — 仍显示成功 toast + 触发 onChallengePassed
      // 🐘 人设转型: 小象恭喜话术
      const toastMsg = getElephantPhrase('saw_it', locale, {
        amount: elephantMoney(savedChallenge.amount),
        hours: elephantHours((savedChallenge.amount / hourlyRate).toFixed(1), locale),
      });
      onToast?.(toastMsg, 'success');
      // 🔧 Aha Moment fix: Demo 模式也触发 onChallengePassed (让 Aha Moment Step 3 显示)
      if (onChallengePassed) {
        onChallengePassed({
          challengeId: savedChallenge.challengeId || `demo-${Date.now()}`,
          itemName: savedChallenge.itemName,
          amount: savedChallenge.amount,
        });
      }
    }
    } finally {
      isGiveUpInProgressRef.current = false;
    }
  }, [setActiveChallenge, sendMessage, t, locale, hourlyRate, onToast, onBuddyStateRefresh, onChallengePassed, onChallengeCompleted]);

  /**
   * handleResume — "Resume challenge" 按钮
   * 调 /api/challenge/resume + 发送恢复消息
   */
  const handleResume = useCallback(async (expired: ExpiredChallenge) => {
    // 🔧 ARCH fix (Round 17 audit H3 — 双击防护 + 清旧 timer):
    //    旧代码无 in-flight guard, 双击发两条 resume 消息 + 两次 API 调用。
    //    另: 旧代码不清 resumeTimerRef 就覆盖, 导致旧 timer ID 丢失 (orphan timer)。
    if (isResumeInProgressRef.current) return;
    isResumeInProgressRef.current = true;
    // 清旧 timer (防止双击时第一个 timer orphan)
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
    try {
      // 🔧 架构还债: 用 apiFetch 替代内联 fetch (统一错误处理 + 类型安全)
      const data = await apiFetch<{ challenge?: { challengeId: string; itemName: string; amount: number } }>('/api/challenge/resume', {
        method: 'POST',
        body: { challengeId: expired.challengeId },
      });
      if (data.challenge) {
        // 恢复 activeChallenge state + 构造 challenge prompt
        const challengeType = getChallengeTypeLabelByAmount(data.challenge.amount);
        // 🐘 人设转型 (2026-09-05): 镜子式 resume prompt 已废弃 → 小象式欢迎回来。
        //    小象可以热情: 欢迎回来 + 物品 + 价格 + 小时 + 一起看完再决定。
        // 🔧 P0-3 fix: 使用用户实际时薪计算生命小时数, 不再硬编码 /20
        const hoursOfLife = (data.challenge.amount / hourlyRate).toFixed(1);
        const challengePrompt = `The user is back. They previously started a challenge about: ${data.challenge.itemName} ($${data.challenge.amount.toFixed(2)}).

This is a ${challengeType} challenge (RESUMED). You are Symy — a warm little elephant companion who guards the user's wallet AND the planet.

YOUR FIRST REPLY (Symy's welcome-back, resumed):
- Greet them warmly — the elephant is happy to see them: "欢迎回来！" / "Welcome back!"
- Name the item + price + hours of life (about ${hoursOfLife} hours at their rate), so the moment is visible again.
- One warm invitation to finish looking together: "咱们接着看完这个再决定？" / "Let's finish looking before you decide."
- Under 30 words (English) / 50 characters (Chinese). Do NOT interrogate ("do you still want it?") — they'll tell you.

EXAMPLE (English): "Welcome back! Still thinking about the ${data.challenge.itemName}? $${data.challenge.amount.toFixed(2)}, about ${hoursOfLife} hours. Let's finish looking together — no rush."
EXAMPLE (Chinese): "欢迎回来！还在想着${data.challenge.itemName}呀？$${data.challenge.amount.toFixed(2)}，大约 ${hoursOfLife} 小时。不急，本象陪你一起看完再决定。"

If you have prior context in memory about this challenge, you may reference it in ONE short phrase — e.g. "上次你说旧的快坏了。" Do NOT recount the whole history. One phrase, then the invitation.

WHEN THE USER DECIDES:
- If they decide NOT to buy → call complete_challenge(challenge_id="${data.challenge.challengeId}"). Then celebrate warmly: "哇！$${data.challenge.amount.toFixed(2)} 留住了——${hoursOfLife} 小时回到你手里。你在做对的事！"
- If they decide TO buy → call complete_challenge(challenge_id="${data.challenge.challengeId}", status="failed") + record_impulse. Then respond with acceptance, zero guilt: "你看清了代价还是想要——你的选择，本象陪着你。"

⚠️ OUTPUT RULES: 1-3 sentences. Warm welcome OK. No probing questions. No guilt. No lecture. Brief.`;
        // 🔧 P1 fix: 设 skip 标记, 防止 setActiveChallenge 触发的 loadHistory 覆盖 sendMessage 的消息
        skipNextHistoryLoadRef.current = true;
        // 先清空 messages (切到 challenge 视图) + 加载 challenge 历史
        setMessages(() => []);
        const challengeData = data.challenge;
        setActiveChallenge({ itemName: challengeData.itemName, amount: challengeData.amount, challengeId: challengeData.challengeId });
        setExpiredChallenge(null);
        // 🔧 PM-NEW-18 fix: 用户消息也强化 'welcome back' 语气, 引导 AI 回复连贯
        // 🔧 P1-2.1 fix (2026-07-21): i18n — 旧代码硬编码英文
        resumeTimerRef.current = setTimeout(() => {
          resumeTimerRef.current = null;
          sendMessage(t('buddy.challengeResumeMessage', { defaultValue: "I'm back — let's continue the challenge about {itemName}", itemName: challengeData.itemName }), challengePrompt, { itemName: challengeData.itemName, amount: challengeData.amount, challengeId: challengeData.challengeId });
          isResumeInProgressRef.current = false;  // 🔧 Round 23 HIGH-3: sendMessage 完成后才解锁
        }, 100);
      } else {
        // API 成功但无 challenge 数据 — 释放锁
        isResumeInProgressRef.current = false;
      }
    } catch (err) {
      logger.warn('[ChatTab] Failed to resume challenge:', err);
      isResumeInProgressRef.current = false;  // 🔧 Round 23 HIGH-3: API 失败时释放锁
    }
  }, [setActiveChallenge, setExpiredChallenge, setMessages, skipNextHistoryLoadRef, sendMessage, hourlyRate, t]);

  /**
   * handleDismiss — "Dismiss" 按钮
   * 调 /api/challenge/dismiss + 清空 expiredChallenge
   */
  // eslint-disable-next-line symy/no-async-callback-mutation
  const handleDismiss = useCallback(async (expired: ExpiredChallenge) => {
    // 🔧 ARCH fix (Round 19 C3 — handleDismiss 静默吞错):
    //    旧代码: catch { /* silent */ } + 无条件 setExpiredChallenge(null)。
    //    API 失败时 banner 消失但服务器未记录 → 下次 loadHistory expiredChallenge 重新出现。
    //    根因修复: 保留乐观清屏 UX, 但 API 失败时显示 toast 让用户知晓。
    try {
      // 🔧 架构还债: 用 apiFetchVoid 替代内联 fetch
      await apiFetchVoid('/api/challenge/dismiss', {
        method: 'POST',
        body: { challengeId: expired.challengeId },
      });
      symyEvents.challengeDismissed({ challengeType: 'expired' });
    } catch (err) {
      logger.warn('[ChatTab] Failed to dismiss expired challenge:', err);
      // 不阻塞清屏 (dismiss 是非关键操作), 但让用户知道服务器状态可能不一致
      const failToast = t('chat.dismissFailedToast', {
        defaultValue: 'Failed to dismiss — challenge may reappear on refresh.',
      });
      onToast?.(failToast, 'info');
    }
    setExpiredChallenge(null);
  }, [setExpiredChallenge, onToast, t]);

  /**
   * handleChooseToBuy — "I choose to buy" 按钮
   * 🔧 P0 fix (mirror philosophy): 用户决定买, 镜子尊重决定 ("You saw it. You're free.")
   * 发送购买意愿消息 + 调 /api/challenge/complete (status=failed)
   * AI 应回复 "You saw the cost. You still want it. It's yours. You're free."
   *
   * 🔧 P0 fix (mirror philosophy — deposit dialog bug):
   *   旧代码: handleChooseToBuy 不调 onChallengeCompleted (正确), 但 AI 随后调 complete_challenge(status='failed')
   *   → handleToolEvent 触发 onChallengeCompleted (因为 SSE 事件不含 status, 无法区分 passed/failed)
   *   → 弹出存款对话框 + 显示 "You saw it. $X stays." toast (错误 — 用户买了, 没钱可存)
   *   修复: 传 isBuyPath=true 给 sendMessage, sendMessage 入口设 justBoughtChallengeRef.current=true,
   *   handleToolEvent 检测到此 ref 时:
   *   - 跳过 onChallengeCompleted (不弹存款对话框)
   *   - 跳过 challengePassedToast (handleChooseToBuy 已显示 "You saw it. You're free.")
   *   sendMessage finally 块清除 ref。
   *
   * 🔧 Race condition fix: 旧代码 handleChooseToBuy 在调用 sendMessage 前手动设 ref=true,
   *   若 sendMessage 被 force-abort (旧 stream 还在跑), finally 块因 abort mismatch 不清 ref →
   *   ref 泄漏到下一个 sendMessage → 误判 buy 路径。修复: ref 由 sendMessage 内部管理 (isBuyPath 参数)。
   */
  // eslint-disable-next-line symy/no-async-callback-mutation
  const handleChooseToBuy = useCallback(async (challenge: ActiveChallenge) => {
    if (isGiveUpInProgressRef.current) return;
    isGiveUpInProgressRef.current = true;
    try {
      const savedChallenge = { itemName: challenge.itemName, amount: challenge.amount, challengeId: challenge.challengeId };
      // 🔧 P1-2 fix: 不再伪造用户消息 "I've decided to buy..."
      //   改为 action 消息 (role='action', 渲染为 "✗ Chose to buy" 状态徽章)
      //   AI 仍通过 apiContent 收到完整上下文, 能正确回复
      const actionContent = t('chat.challengeChoseToBuyAction') || '✗ Chose to buy';
      // 🔧 P0-K-2 fix: I choose to buy — 增加干预提示, 让 AI 反映财务影响
      //    旧代码: AI 只说 "You bought it. You saw the cost." 无干预
      //    新代码: AI 被指示反映: 这笔消费对债务/自由时间的影响
      const apiActionContent = `[Action: User chose to buy ${savedChallenge.itemName} for $${savedChallenge.amount.toFixed(2)}. They saw the cost and still decided to buy it. INTERVENTION: Reflect the financial impact briefly — how this amount adds to their debt pile or delays their debt-free date. Do NOT block or judge. Just name what is true: the cost, the hours of life, and that this adds to what they owe. One sentence. Then step back.]`;
      setActiveChallenge(undefined);
      // 🔧 P0 fix: 传 isBuyPath=true, sendMessage 入口设 buy flag (避免 force-abort race)
      sendMessage(actionContent, apiActionContent, savedChallenge, true, 'chose_to_buy');

      // 调 complete_challenge API (status=failed = 用户买了, 不是抵御)
      if (savedChallenge.challengeId) {
        try {
          await apiFetchVoid('/api/challenge/complete', {
            method: 'POST',
            body: {
              challengeId: savedChallenge.challengeId,
              status: 'failed',
              itemName: savedChallenge.itemName,
              amount: savedChallenge.amount,
            },
          });
          onBuddyStateRefresh?.();
          symyEvents.challengeCompleted({ challengeType: 'bought' });
          // 🔧 需求九: bought 路径 — 触发沉默时刻 (bought 文案: "你看见了代价...")
          //    沉默时刻在 toast 之前显示 (让"看见"先沉淀, 再给反馈)
          onChallengeBought?.(savedChallenge.amount, savedChallenge.itemName);
          // 🐘 人设转型: 用户买了 → 小象不评判, 陪着用户 ("你的选择, 本象陪着你")
          const toastMsg = getElephantPhrase('bought_anyway', locale, {
            amount: elephantMoney(savedChallenge.amount),
            hours: elephantHours((savedChallenge.amount / hourlyRate).toFixed(1), locale),
          });
          onToast?.(toastMsg, 'info');
          // 🔧 V4-5 fix: 即时显示"挑战已记录"通知, 不等 AI 回复
          //   根因: 用户点 Bought anyway 后, banner 消失, 但 MCP 通知要等 AI 调 complete_challenge 才显示
          //   期间用户不确定挑战是否结束 (V4-5: 挑战无结算反馈)
          //   修复: 用 onToast 即时反馈 (addMcpNotification 不在此 hook 参数中, 用 onToast 替代)
          onToast?.(t('chat.mcpNotifications.challengeRecorded', { defaultValue: '📋 Challenge recorded. Symy noted this purchase.' }), 'info');
        } catch (err) {
          logger.warn('[ChatTab] complete_challenge (failed) API error:', err);
          // 🔧 E3 fix (batch94-c): bought 分支 API 失败不再零反馈 — 复用 passed 分支 (Round 19 H3-audit1)
          //    的 retry toast 模式与 i18n key (en/zh 文案 "Marked locally" 不区分 passed/bought, 同 key 复用)。
          //    onChallengeBought 照 passed 模式仅在成功路径触发 (失败不弹沉默时刻)。
          const failToast = t('chat.challengeSaveFailedToast', {
            defaultValue: 'Challenge marked as passed locally, but server save failed. Please retry or refresh.',
          });
          onToast?.(failToast, 'info');
        }
      }
    } finally {
      isGiveUpInProgressRef.current = false;
    }
  }, [setActiveChallenge, sendMessage, t, locale, hourlyRate, onToast, onBuddyStateRefresh, onChallengeBought]);

  return { handleGiveUp, handleChooseToBuy, handleResume, handleDismiss };
}
