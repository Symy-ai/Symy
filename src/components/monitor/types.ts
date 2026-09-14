/**
 * MonitorTab — 类型定义（从 monitor-tab.tsx 抽出，C3 拆分）
 *
 * 纯类型，无运行时逻辑。行为零变化。
 */

import type { EmailConnection, EmailReceipt } from '@/lib/supabase';

export interface MonitorTabProps {
  onTalkToAI: (context: { platform: string; amount: number; reasons: string[]; time: string }) => void;
  onImpulseAlert: (score: number) => void;
  isDemo?: boolean;
  onAuthPrompt?: (feature: string) => void;
}

export type ViewMode = 'notifications' | 'receipts';

export interface EmailConnectionCardProps {
  connections: EmailConnection[];
  isConnecting: boolean;
  isLoadingEmail: boolean;
  onConnectGmail: () => void;
  onConnectIMAP: (email: string, authCode: string) => void;
  onDisconnect: (id: string) => void;
  onScan: () => void;
  isScanning: boolean;
  scanResult: { scanned: number; newReceipts: number } | null;
  actionableCount: number;
  autoSyncEnabled: boolean;
  nextSyncIn: number; // seconds until next auto-sync
  onToggleAutoSync: () => void;
}

export interface EmailReceiptsListProps {
  receipts: EmailReceipt[];
  onTalkToAI: (context: { platform: string; amount: number; reasons: string[]; time: string }) => void;
  onIgnore: (id: string) => void;
  onRefund: (id: string) => void;
  onMarkRefunded?: (id: string) => void;
  isDemoMode?: boolean;  // 🔧 N15 fix: to show demo-specific empty state
}

export interface ToastNotificationProps {
  toast: { message: string; type: 'success' | 'info' };
  onDismiss: () => void;
}
