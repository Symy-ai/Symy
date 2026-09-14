// ProfileTab 对外 props 契约 (File Split Wave 1 从 profile-tab.tsx 拆出 — 纯类型, 零运行时)
import type { DreamFund } from '@/types/buddy-state';

export interface ProfileTabProps {
  darkMode?: boolean;
  onOpenInsights?: () => void;
  onToggleDarkMode?: () => void;
  onNavigateMonitor?: () => void;
  isDemo?: boolean;
  onAuthPrompt?: (feature: string) => void;
  buddyStreak?: number;
  buddyTotalSaved?: number;
  buddyChallengesCompleted?: number;
  buddyDreamFunds?: Array<{ current: number; target: number }>;
  isActive?: boolean;
  onCreateDreamFund?: (fund: Omit<DreamFund, 'id'>) => string;
  onUpdateDreamFund?: (fundId: string, updates: Partial<Omit<DreamFund, 'id'>>) => void;
  onDeleteDreamFund?: (fundId: string) => void;
  onReorderDreamFunds?: (newOrder: string[]) => void;
  dreamFunds?: DreamFund[];
}
