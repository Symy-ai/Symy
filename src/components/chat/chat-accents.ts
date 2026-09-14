// Chat tab 的 buddy 健康状态配色 (File Split Wave 1 从 chat-tab.tsx 拆出 — 纯常量, 零运行时)
import type { BuddyHealth } from '@/types/buddy-state';

export const BUDDY_ACCENT: Record<BuddyHealth, string> = {
  thriving: 'text-green-400 bg-green-500/20',
  healthy: 'text-emerald-400 bg-emerald-500/20',
  weak: 'text-yellow-400 bg-yellow-500/20',
  critical: 'text-red-400 bg-red-500/20',
  dormant: 'text-gray-500 bg-gray-500/20',
};

// Neon accent gradients per health (kept in parent for gradientClass prop)
export const BUDDY_GRADIENT: Record<BuddyHealth, string> = {
  thriving: 'from-green-400 to-emerald-300',
  healthy: 'from-emerald-400 to-cyan-400',
  weak: 'from-yellow-400 to-amber-300',
  critical: 'from-red-400 to-rose-300',
  dormant: 'from-gray-500 to-gray-600',
};
