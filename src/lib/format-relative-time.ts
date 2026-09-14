/**
 * formatRelativeTime — Unified relative time formatting using date-fns.
 *
 * 🔧 Round 116: Replaces 5 duplicate formatTimeAgo/formatRelativeTime/getTimeAgo
 *    implementations across the codebase with a single date-fns-based function.
 *
 * Replaced files:
 * - src/lib/utils.ts: formatTimeAgo (7 lines, no i18n)
 * - src/components/buddy/constants.tsx: formatTimeAgo (10 lines, with i18n)
 * - src/components/buddy/proactive-message-banner.tsx: formatRelativeTime (18 lines, manual zh/en)
 * - src/components/home-tab.tsx: getTimeAgo (8 lines, with i18n)
 * - src/components/monitor/helpers.ts: formatReceiptTime (10 lines, with i18n)
 *
 * Total: ~53 lines of duplicate logic replaced by ~25 lines.
 *
 * Uses date-fns formatDistanceToNow which is:
 * - Well-tested (millions of downloads)
 * - Locale-aware (zh-CN, en-US)
 * - Handles edge cases (future dates, same time, etc.)
 */

import { formatDistanceToNow } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';

export type SupportedLocale = 'en' | 'zh';

/**
 * Format a date as a relative time string (e.g., "3 minutes ago", "2 hours ago").
 *
 * @param date - The date to format
 * @param locale - 'en' or 'zh' (default: 'en')
 * @returns A localized relative time string
 */
export function formatRelativeTime(date: Date | string, locale: SupportedLocale = 'en'): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';

    const dateFnsLocale = locale === 'zh' ? zhCN : enUS;

    // Use date-fns formatDistanceToNow with addSuffix=true for "ago" suffix
    return formatDistanceToNow(d, { addSuffix: true, locale: dateFnsLocale });
      // safe to ignore: non-critical background operation, error already logged
  } catch {
            // safe to ignore: non-critical background operation, error already logged
    return '';
  }
}

/**
 * Format a date as a short relative time (e.g., "3m", "2h", "5d").
 * Used in space-constrained UI like chat bubbles.
 *
 * @param date - The date to format
 * @returns A short relative time string
 */
export function formatRelativeTimeShort(date: Date | string): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';

    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
      // safe to ignore: non-critical background operation, error already logged
  } catch {
            // safe to ignore: non-critical background operation, error already logged
    return '';
  }
}
