/**
 * 🔧 b138 批B (2026-09-29): 回访条全家桶聚合 hook
 *
 * 7 个同构回访 hook（recap + 6 followup）的纯转发聚合 — 组件内 7 个调用点收拢为 1 个,
 * 配套 sections/followup-strips.tsx 承载 JSX 编排。原 hook 零改动（b138 R1 红线:
 * 聚合已有 hook 而非再拆一层）。
 *
 * 返回对象 useMemo 包裹（b138 R5: 防 memo 边界陷阱 — 即使当前无 memo 消费者）。
 */
import { useMemo } from 'react';
import { useChatRecap } from './use-chat-recap';
import { useMicroChallengeFollowup } from './use-micro-challenge-followup';
import { useCooldownFollowup } from './use-cooldown-followup';
import { usePrepurchaseFollowup } from './use-prepurchase-followup';
import { useDuplicateReuseFollowup } from './use-duplicate-reuse-followup';
import { useEmotionGuardFollowup } from './use-emotion-guard-followup';
import { usePostPurchaseReview } from '@/hooks/use-post-purchase-review';
import type { ChatMessage } from '@/types/chat-message';

export interface FollowupStripsInput {
  messages: ChatMessage[];
  isDemo: boolean;
  historyReady: boolean;
}

export function useFollowupStrips({ messages, isDemo, historyReady }: FollowupStripsInput) {
  // 🌱 会话连续性: 上次聊到一半的绿色话题 → 一次性「上次我们聊到」回顾条
  const { recap, dismiss: dismissRecap } = useChatRecap({ messages, isDemo, historyReady });

  // 🐞 batch46-b: 到期微挑战的次日一次性回访条 (localStorage 待回访记录驱动)
  const { dueRecord: dueMicroChallenge, clear: clearMicroChallengeFollowup } = useMicroChallengeFollowup({ isDemo, historyReady });

  // 🐘 batch48-b: 到期冷静卡的次日一次性回访条 (localStorage 待回访记录驱动;
  // 二选一后回访条内联展示祝福/成功文案, 记录已在 store 内消解)
  const { dueRecord: dueCooldown } = useCooldownFollowup({ isDemo, historyReady });

  // 🐘 batch50-a: 买前三问选「冷静 24h」的次日一次性回访条 (localStorage 待回访
  // 记录驱动; 二选一后回访条内联展示祝福/成功文案, 记录已在 store 内消解)
  const { dueRecord: duePrepurchase, clear: clearPrepurchaseFollowup } = usePrepurchaseFollowup({ isDemo, historyReady });

  const { due: dueDuplicateReuse, clear: clearDuplicateReuseFollowup } = useDuplicateReuseFollowup({ isDemo, historyReady });

  // 🐘 batch60-c: 情绪守护选「先等 10 分钟」的到期待追问条 (localStorage one-shot
  // 等待记录驱动; 刷新/换会话后卡不在了, 由追问条接棒二选一)
  const { dueRecord: dueEmotionWait } = useEmotionGuardFollowup({ isDemo, historyReady });

  // 🐘 batch51-a: 拦截失败后 1–2 天的购后复盘回访条 (health_events 派生, 一次性展示)
  const { dueReview, reviewSummary, recordReview } = usePostPurchaseReview({ isDemo, historyReady });

  // 🔧 b138 R5: useMemo 防引用陷阱 (未来加 memo 消费者不踩坑)
  return useMemo(() => ({
    recap, dismissRecap,
    dueMicroChallenge, clearMicroChallengeFollowup,
    dueCooldown,
    duePrepurchase, clearPrepurchaseFollowup,
    dueDuplicateReuse, clearDuplicateReuseFollowup,
    dueEmotionWait,
    dueReview, reviewSummary, recordReview,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 聚合层: deps 来自内部 hook 返回值, 全部列出
  }), [recap, dismissRecap, dueMicroChallenge, clearMicroChallengeFollowup, dueCooldown, duePrepurchase, clearPrepurchaseFollowup, dueDuplicateReuse, clearDuplicateReuseFollowup, dueEmotionWait, dueReview, reviewSummary, recordReview]);
}
