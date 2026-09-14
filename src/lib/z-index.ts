/**
 * Z-Index Layering System — 统一的 z-index 层级规范
 *
 * 🔧 PM-P1-2 fix (2026-07-17): 统一所有模态框/覆盖层的 z-index
 *
 * 层级规范 (从低到高):
 *   1. DECORATIVE (5)       — 装饰性元素 (粒子效果等, pointer-events-none)
 *   2. OVERLAY (100)        — 非阻塞覆盖层 (variable-reward, onboarding-guide)
 *   3. TOAST (200)          — Toast 通知 (非阻塞, pointer-events-none)
 *   4. MODAL (300)          — 标准模态框 (deposit-dialog, share-card, display-name 等)
 *   5. MODAL_HIGH (400)     — 高优先级模态框 (silent-moment, badges, sign-out)
 *   6. GLOBAL_TOAST (500)   — 全局 Toast (最高优先级通知)
 *   7. RITUAL (9999)        — 仪式性全屏覆盖 (daily-ritual-overlay, 必须盖过一切)
 *
 * 设计原则:
 * - 同一层级使用相同的 z-index 值, 后渲染的盖在前面 (React Portal 顺序)
 * - 跨层级时, 高层级盖过低层级
 * - RITUAL (9999) 是特殊层级: 全屏覆盖 + 不透明背景, 用户必须先关闭才能操作
 * - 不再使用 z-[10000] (sign-out-dialog 降为 MODAL_HIGH)
 *
 * 迁移状态:
 * - ✅ daily-ritual-overlay.tsx: RITUAL (保持 9999, inline style)
 * - ✅ sign-out-dialog.tsx: MODAL_HIGH (从 z-[10000] 降为 z-[400])
 * - 🔄 其他模态框: 逐步迁移到常量 (本次不强制修改, 避免引入风险)
 *
 * 用法:
 *   import { Z_INDEX } from '@/lib/z-index';
 *   <div className="fixed inset-0 z-[300]" />  // 旧写法
 *   <div className="fixed inset-0" style={{ zIndex: Z_INDEX.MODAL }} />  // 新写法
 */

export const Z_INDEX = {
  /** 装饰性元素 (粒子效果等, pointer-events-none) */
  DECORATIVE: 5,
  /** 非阻塞覆盖层 (variable-reward, onboarding-guide) */
  OVERLAY: 100,
  /** Toast 通知 (非阻塞, pointer-events-none) */
  TOAST: 200,
  /** 标准模态框 (deposit-dialog, share-card, display-name 等) */
  MODAL: 300,
  /** 高优先级模态框 (silent-moment, badges, sign-out) */
  MODAL_HIGH: 400,
  /** 全局 Toast (最高优先级通知) */
  GLOBAL_TOAST: 500,
  /** 仪式性全屏覆盖 (daily-ritual-overlay, 必须盖过一切) */
  RITUAL: 9999,
} as const;

export type ZIndexLayer = keyof typeof Z_INDEX;
