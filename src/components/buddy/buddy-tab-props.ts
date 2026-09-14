// BuddyTab 对外 props 契约 (File Split Wave 1 从 buddy-tab.tsx 拆出 — 纯类型, 零运行时)
import type { BuddyState, DreamFund } from '@/types/buddy-state';
// ChallengeContext 单一 source of truth
import type { ChallengeContext } from '@/types/challenge-context';

export interface BuddyTabProps {
  buddyState: BuddyState;
  onNavigateChat: (context?: { type: 'challenge' | 'healing' | 'default'; message?: string; challengeContext?: ChallengeContext }) => void;
  onRevive: () => void;
  onAddTokens: (amount: number, reason: 'survival' | 'growth' | 'pleasure') => void;
  /** 🔧 Round 3 C4: 服务端强制 healing-kit 每日限制 */
  onUseHealingKit?: () => Promise<'success' | 'already_used' | 'error'>;
  onBuddyStateRefresh?: () => void;
  onToast?: (message: string, type?: 'success' | 'info') => void;
  isDemo?: boolean;
  /** 🔧 Round 33 HIGH-1/2: 用户 ID, 用于检测用户切换并清空本地 state */
  userId?: string;
  /** 🔧 Bug 17 fix: 数据加载中显示 skeleton 而非空白闪烁 */
  isLoading?: boolean;
  onCreateDreamFund?: (fund: Omit<DreamFund, 'id'>) => string;
  onUpdateDreamFund?: (fundId: string, updates: Partial<Omit<DreamFund, 'id'>>) => void;
  onDeleteDreamFund?: (fundId: string) => void;
  onReorderDreamFunds?: (newOrder: string[]) => void; // 🔧 BUG-014: 拖拽排序
  /** 🔧 P0 fix: page.tsx 传入的时薪 (作为直接数据源, 保证 Profile 改后主页立即更新) */
  hourlyRateProp?: number;
  /** 🔧 PM3-P2-1 fix: 今日任务清单回调 */
  onSeeIt?: () => void;
  /** Round 105: Gacha entry from Buddy tab (replaces Pet Symy button) */
  onGacha?: () => void;
  onSetRate?: () => void;
  /** 🔧 PM3-P2-1 fix: 今日任务数据 (从 page.tsx 传入) */
  dailyTasks?: import('@/hooks/use-daily-tasks').DailyTasks;
  dailyTasksCompleted?: number;
}
