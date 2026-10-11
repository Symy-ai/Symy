// Chat tab 的 buddy 健康状态配色 (File Split Wave 1 从 chat-tab.tsx 拆出 — 纯常量, 零运行时)
// 🔧 R1041 收编: BUDDY_ACCENT 已删 — 09-06 minimal 化后全库生产零消费 (仅测试引用).
//   判定: 测试引用不算存活 — 测试为死对象写断言 = 死测试 (被删对象专属测试同步删除惯例).
import type { BuddyHealth } from '@/types/buddy-state';

// Neon accent gradients per health (kept in parent for gradientClass prop)
export const BUDDY_GRADIENT: Record<BuddyHealth, string> = {
  thriving: 'from-green-400 to-emerald-300',
  healthy: 'from-emerald-400 to-cyan-400',
  weak: 'from-yellow-400 to-amber-300',
  critical: 'from-red-400 to-rose-300',
  dormant: 'from-gray-500 to-gray-600',
};
