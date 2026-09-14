/**
 * MonitorTab — 纯辅助函数（从 monitor-tab.tsx 抽出，C3 拆分）
 *
 * 纯函数，无 React hooks，无副作用。行为零变化。
 */

export function getPlatformEmoji(platform: string): string {
  const map: Record<string, string> = {
    tiktok_shop: '🎵',
    amazon: '📦',
    target: '🎯',
    walmart: '🛒',
    shein: '👗',
    temu: '🔥',
    ebay: '🏷️',
    unknown: '🛍️',
  };
  return map[platform] || '🛍️';
}

export function formatReceiptTime(dateStr: string, t: (key: string, values?: Record<string, string | number>) => string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return t('common.justNow');
  if (diffMins < 60) return t('common.minutesAgo', { n: diffMins });
  if (diffHours < 24) return t('common.hoursAgo', { n: diffHours });
  if (diffDays < 7) return t('common.daysAgo', { n: diffDays });
  return date.toLocaleDateString();
}

export function formatCountdown(seconds: number, t: (key: string, values?: Record<string, string | number>) => string): string {
  if (seconds <= 0) return t('common.justNow');
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}
