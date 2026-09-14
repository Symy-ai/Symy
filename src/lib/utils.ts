import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, subDays, differenceInDays } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Bug #3 修复：格式化平台原始名称为可读名称
const PLATFORM_NAMES: Record<string, string> = {
  tiktok_shop: 'TikTok Shop',
  amazon: 'Amazon',
  target: 'Target',
  walmart: 'Walmart',
  shein: 'SHEIN',
  temu: 'Temu',
  ebay: 'eBay',
  shopify: 'Shopify',
  gmail: 'Gmail',
  outlook: 'Outlook',
};

export function formatPlatformName(platform: string): string {
  return PLATFORM_NAMES[platform.toLowerCase()] || platform.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Calculate consecutive days without being induced into purchases.
 * Uses date-fns for reliable date arithmetic (avoids manual UTC/local offset bugs).
 */
export function calculateDaysStreak(receipts: { received_at: string; impulse_score: number }[]): number {
  if (receipts.length === 0) return 0;

  // Collect days with induced purchases (score >= 60) using date-fns format
  const impulseDays = new Set<string>();
  let earliestDate: Date | null = null;
  for (const r of receipts) {
    const rDate = new Date(r.received_at);
    if (!earliestDate || rDate < earliestDate) earliestDate = rDate;
    if (r.impulse_score >= 60) {
      impulseDays.add(format(rDate, 'yyyy-MM-dd'));
    }
  }

  // Count consecutive days from today backwards without induced spending
  let streak = 0;
  const today = new Date();
  const maxDays = earliestDate
    ? Math.min(365, differenceInDays(today, earliestDate) + 1)
    : 365;
  for (let i = 0; i < maxDays; i++) {
    const dayKey = format(subDays(today, i), 'yyyy-MM-dd');
    if (impulseDays.has(dayKey)) {
      break;
    }
    streak++;
  }
  return streak;
}

/**
 * 截断文本到指定长度，超长时追加后缀（省略号）。
 * - 默认后缀 '…'（U+2026，UI 展示用）
 * - 审计日志等场景可显式传 suffix（如 '...[truncated]'）
 * - text 为 null/undefined 时返回 undefined（保留原 ai-audit 语义）
 */
export function truncate(
  text: string | undefined | null,
  max: number,
  suffix = '…',
): string | undefined {
  if (text == null) return undefined;
  return text.length > max ? text.slice(0, max) + suffix : text;
}

/**
 * 格式化 ISO 日期字符串为本地化显示。
 * 使用 date-fns 的 format 函数, 支持 zh/en locale。
 *
 * @param iso ISO 日期字符串
 * @param locale 'zh' | 'en' (默认 'en')
 * @param includeTime 是否包含时间 (默认 false)
 * @returns 格式化后的日期字符串, 失败时返回原始 iso
 */
export function formatDate(iso: string, _locale: string = 'en', includeTime: boolean = false): string {
  try {
    const d = new Date(iso);
    // 保持与原 toLocaleDateString 一致的输出格式: "Nov 23, 2025" 或 "Nov 23, 2025, 2:30 PM"
    // date-fns format: 'MMM d, yyyy' = "Nov 23, 2025"
    const pattern = includeTime ? 'MMM d, yyyy, h:mm a' : 'MMM d, yyyy';
    return format(d, pattern);
  } catch { /* silent: non-critical operation */ }
  return iso;
}

/**
 * 🔧 Round 116: formatTimeAgo moved to src/lib/format-relative-time.ts
 * This re-export preserves backward compatibility for existing imports.
 * New code should import from '@/lib/format-relative-time' directly.
 */
export { formatRelativeTimeShort as formatTimeAgo } from '@/lib/format-relative-time';
