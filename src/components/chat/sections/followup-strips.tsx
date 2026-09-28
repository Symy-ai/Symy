/**
 * 🔧 b138 批B (2026-09-29): 回访条全家桶编排组件
 *
 * 承载 chat-tab.tsx 原回访条 JSX（recap + 6 followup，同序搬移）。
 * 数据形状来自 useFollowupStrips 聚合 hook 的返回类型（ReturnType 单源）;
 * 本组件纯展示编排, 不含业务逻辑。
 */
import { ChatRecap } from '../parts/chat-recap';
import { MicroChallengeFollowup } from '../parts/micro-challenge-followup';
import { CooldownFollowup } from '../parts/cooldown-followup';
import { PrepurchaseFollowup } from '../parts/prepurchase-followup';
import { DuplicateReuseFollowup } from '../parts/duplicate-reuse-followup';
import { EmotionGuardCheckin } from '../parts/emotion-guard-checkin';
import { PostPurchaseReview } from '../parts/post-purchase-review';
import type { useFollowupStrips } from '../hooks/use-followup-strips';

type Strips = ReturnType<typeof useFollowupStrips>;

export interface FollowupStripsProps {
  strips: Strips;
  onRecapContinue: (prompt: string) => void;
}

/** 回访条编排 — chat-header 之下、消息列表之上, 不侵入消息数组 */
export function FollowupStrips({ strips, onRecapContinue }: FollowupStripsProps) {
  const {
    recap, dismissRecap,
    dueMicroChallenge, clearMicroChallengeFollowup,
    dueCooldown,
    duePrepurchase, clearPrepurchaseFollowup,
    dueDuplicateReuse, clearDuplicateReuseFollowup,
    dueEmotionWait,
    dueReview, reviewSummary, recordReview,
  } = strips;

  return (
    <>
      {/* 🌱 「上次我们聊到」一次性回顾条 */}
      {recap && (
        <ChatRecap topic={recap} onContinue={onRecapContinue} onDismiss={dismissRecap} />
      )}

      {/* 🐞 batch46-b 微挑战次日回访条 — recap 条之下, 同一一次性展示语义 */}
      {dueMicroChallenge && (
        <MicroChallengeFollowup record={dueMicroChallenge} onResolved={clearMicroChallengeFollowup} />
      )}

      {/* 🐘 batch48-b 冷静卡次日回访条 — 微挑战回访条之下, 同一一次性展示语义 */}
      {dueCooldown && (
        <CooldownFollowup record={dueCooldown} />
      )}

      {/* 🐘 batch50-a 买前三问「冷静 24h」次日回访条 — 冷静卡回访条之下, 同一一次性展示语义 */}
      {duePrepurchase && (
        <PrepurchaseFollowup record={duePrepurchase} onResolved={clearPrepurchaseFollowup} />
      )}

      {dueDuplicateReuse && (
        <DuplicateReuseFollowup
          card={dueDuplicateReuse.card}
          decisionId={dueDuplicateReuse.decisionId}
          onResolved={clearDuplicateReuseFollowup}
        />
      )}

      {/* 🐘 batch60-c 情绪守护「先等 10 分钟」到期待追问条 — 三问回访条之下, 同一一次性展示语义 */}
      {dueEmotionWait && (
        <EmotionGuardCheckin record={dueEmotionWait} />
      )}

      {/* 🐘 batch51-a 购后复盘回访条 — 三问回访条之下, 同一一次性展示语义 */}
      {dueReview && (
        <PostPurchaseReview record={dueReview} summary={reviewSummary} onAnswered={recordReview} />
      )}
    </>
  );
}
