/**
 * Buddy query key — react-query 缓存键唯一权威
 *
 * 🔧 架构批1 F3 (09-29, 依据 ~/briefs/arch-next-targets.md):
 *   use-buddy-state-rq ↔ use-buddy-actions 曾互 import 形成运行时循环依赖
 *   (state-rq import useBuddyActions 运行时值, actions 反向 import 本常量)。
 *   常量下沉到本无依赖叶子文件, 两 hook 改引, 环消除。
 *
 * use-buddy-timers.ts 有本地同值常量 (未 import, 自带副本) — 值不变, 不动。
 */

export const BUDDY_STATE_KEY = ['buddy-state'] as const;
