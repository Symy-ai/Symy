/**
 * monitor/ 子目录 index — re-export（C3 拆分）
 *
 * 从 monitor-tab.tsx 抽出的子组件/类型/常量/纯辅助函数集中 re-export。
 * 主文件从此处 import，外部消费者不受影响。
 */

export type {
  MonitorTabProps,
  ViewMode,
  EmailConnectionCardProps,
  EmailReceiptsListProps,
  ToastNotificationProps,
} from './types';
export { AUTO_SYNC_INTERVAL_MS, AUTO_SYNC_KEY, AUTO_SYNC_ENABLED_KEY } from './constants';
export { getPlatformEmoji, formatReceiptTime, formatCountdown } from './helpers';
export { EmailConnectionCard } from './email-connection-card';
export { EmailReceiptsList } from './email-receipts-list';
export { ToastNotification } from './toast-notification';
