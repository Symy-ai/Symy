'use client';

import { SilentMomentOverlay } from '../silent-moment-overlay';
import type { SilentMomentState } from '@/hooks/use-silent-moment';

interface SilentMomentSectionProps {
  silentMoment: SilentMomentState;
  /** 沉默时刻完成后弹出存入弹窗 (setDepositDialog) */
  onOpenDeposit: (deposit: { challengeId: string; savedAmount: number }) => void;
  onChallengePassed?: (challenge: { challengeId: string; itemName: string; amount: number }) => void;
  onComplete: () => void;
}

/**
 * 🔧 需求九: 沉默时刻 — 挑战完成后 2s 全屏仪式, 完成后弹 DepositDialog (saw) 或结束 (bought)
 * (原为 chat-tab.tsx 内联 JSX — File Split Wave 1 纯搬运, 行为零变化)
 * 由父组件条件渲染: {silentMoment && <SilentMomentSection .../>}
 */
export function SilentMomentSection({ silentMoment, onOpenDeposit, onChallengePassed, onComplete }: SilentMomentSectionProps) {
  return (
    <SilentMomentOverlay
      outcome={silentMoment.outcome}
      amount={silentMoment.amount}
      itemName={silentMoment.itemName}
      hoursOfLife={silentMoment.hoursOfLife}
      onComplete={() => {
        if (silentMoment.pendingDeposit) onOpenDeposit(silentMoment.pendingDeposit);
        // 🔧 ARCH fix Round 74 (Finding 4): fire deferred onChallengePassed AFTER the
        // silent moment ritual completes. This prevents AhaMomentOnboarding from
        // overlapping with the silent moment overlay.
        if (silentMoment.pendingAhaMoment) {
          onChallengePassed?.(silentMoment.pendingAhaMoment);
        }
        onComplete();
      }}
    />
  );
}
