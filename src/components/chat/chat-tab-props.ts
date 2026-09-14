// ChatTab 对外 props 契约 (File Split Wave 1 从 chat-tab.tsx 拆出 — 纯类型, 零运行时)
import type { BuddyState } from '@/types/buddy-state';

export interface ChatTabProps {
  impulseContext?: {
    platform: string;
    amount: number;
    reasons: string[];
    time: string;
  };
  buddyState?: BuddyState;
  contextMessage?: string;
  challengeContext?: {
    itemName: string;
    amount: number;
    challengeId?: string;
  };
  onContextConsumed?: () => void;
  onBuddyStateRefresh?: () => void;
  isDemo?: boolean;
  onAuthPrompt?: (feature: string) => void;
  onToast?: (message: string, type?: 'success' | 'info') => void; // 🔧 BUG-013: 挑战完成 toast
  // 🔧 Aha Moment: 挑战通过后通知 page.tsx 显示 Step 3
  onChallengePassed?: (challenge: { challengeId: string; itemName: string; amount: number }) => void;
  /** 🔧 PM3-P2-1 fix: 用户发送消息时通知 page.tsx (用于今日任务清单) */
  onMessageSent?: () => void;
  /** 🔧 PM-FEATURE fix (2026-07-17): 存款成功后跳转到 Me 页面梦想基金模块 */
  onNavigateProfile?: () => void;
}
