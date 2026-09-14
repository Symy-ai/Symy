/**
 * ButterflyTab — 常量定义（从 butterfly-tab.tsx 抽出，C5 拆分）
 *
 * 纯常量，无运行时逻辑。行为零变化。
 *
 * ARCH fix Round 73 — Audit Finding 5.1: TONE underscore constants are the SINGLE SOURCE OF TRUTH.
 *   旧代码: TONE_EMOJI / TONE_ACCENT_DARK / TONE_GLOW_DARK etc 在 3 个文件中重复定义
 *   (tab/constants.ts, butterfly-history-list.tsx, butterfly-history-detail.tsx),
 *   且 butterfly-history-list.tsx 与 tab/session-card.tsx 形成运行时循环依赖。
 *   根因修复: 所有 TONE underscore 常量集中在本文件, 其他文件 import。
 */

import type { DecisionType } from '../../types';

// ============================================================
// 预设的消费决策示例 — 本地化
// ============================================================

export const EXAMPLE_DECISION_KEYS = [
  { type: 'bought' as DecisionType, descKey: 'butterfly.examples.jacketZara', amount: 159, platform: 'ZARA' },
  { type: 'bought' as DecisionType, descKey: 'butterfly.examples.dysonTiktok', amount: 499, platform: 'TikTok Shop' },
  { type: 'resisted' as DecisionType, descKey: 'butterfly.examples.temuGadget', amount: 129, platform: 'Temu' },
  { type: 'bought' as DecisionType, descKey: 'butterfly.examples.sneakersNike', amount: 299, platform: 'Nike' },
  { type: 'resisted' as DecisionType, descKey: 'butterfly.examples.amazonBook', amount: 119, platform: 'Amazon' },
  { type: 'bought' as DecisionType, descKey: 'butterfly.examples.skincareInstagram', amount: 199, platform: 'Instagram' },
  // 🔧 P1-8 fix: 添加 considering 类型样本故事 (之前缺失, 导致 "I am considering" 标签下仍显示 bought/resisted 样本)
  { type: 'considering' as DecisionType, descKey: 'butterfly.examples.iphoneConsidering', amount: 1099, platform: 'Apple Store' },
  { type: 'considering' as DecisionType, descKey: 'butterfly.examples.ps5Considering', amount: 499, platform: 'Best Buy' },
  { type: 'considering' as DecisionType, descKey: 'butterfly.examples.dysonConsidering', amount: 599, platform: 'Dyson' },
];

// ============================================================
// 基调颜色映射 — 单一事实源
// ============================================================

// Dark-mode accent colors (used by tab/* + history/*)
export const TONE_ACCENT_COLORS: Record<string, string> = {
  hopeful: '#6ee7b7',
  neutral: '#d1d5db',
  dark: '#fca5a5',
  twist: '#d8b4fe',
};

// Alias for backward compat — history files use TONE_ACCENT_DARK name
export const TONE_ACCENT_DARK = TONE_ACCENT_COLORS;

// Light mode accent colors — deeper/richer for readability on white backgrounds
export const TONE_ACCENT_COLORS_LIGHT: Record<string, string> = {
  hopeful: '#059669',  // emerald-600
  neutral: '#6b7280',  // gray-500
  dark: '#dc2626',      // red-600
  twist: '#7c3aed',    // violet-600
};

// Alias for backward compat
export const TONE_ACCENT_LIGHT = TONE_ACCENT_COLORS_LIGHT;

// Border colors (used by tab/* — chapter-complete-view, demo-scene-player)
export const TONE_BORDER_COLORS: Record<string, string> = {
  hopeful: 'rgba(16,185,129,0.3)',
  neutral: 'rgba(156,163,175,0.25)',
  dark: 'rgba(239,68,68,0.3)',
  twist: 'rgba(168,85,247,0.3)',
};

// Alias for butterfly-history-detail.tsx backward compat
export const TONE_BORDER_DARK = TONE_BORDER_COLORS;

// Light mode border colors — more visible on white backgrounds
export const TONE_BORDER_COLORS_LIGHT: Record<string, string> = {
  hopeful: 'rgba(5,150,105,0.35)',
  neutral: 'rgba(107,114,128,0.25)',
  dark: 'rgba(220,38,38,0.3)',
  twist: 'rgba(124,58,237,0.35)',
};

// Alias for butterfly-history-detail.tsx backward compat
export const TONE_BORDER_LIGHT = TONE_BORDER_COLORS_LIGHT;

// Glow colors (used by history list / detail / session-card)
// Lower opacity than BORDER — for ambient glow effect, not borders.
export const TONE_GLOW_DARK: Record<string, string> = {
  hopeful: 'rgba(16,185,129,0.15)',
  neutral: 'rgba(156,163,175,0.1)',
  dark: 'rgba(239,68,68,0.15)',
  twist: 'rgba(168,85,247,0.15)',
};

export const TONE_GLOW_LIGHT: Record<string, string> = {
  hopeful: 'rgba(5,150,105,0.08)',
  neutral: 'rgba(107,114,128,0.06)',
  dark: 'rgba(220,38,38,0.08)',
  twist: 'rgba(124,58,237,0.08)',
};

// 🔧 ARCH fix Round 73: Reconciled TONE_EMOJI.twist to 🌀 (cyclone) — consistent across
// history-list + history-detail + session-card. The previous tab/constants.ts value '🎰'
// (slot machine) carried gambling connotation that conflicts with the app's anti-indulgent-
// consumption philosophy. 🌀 (cyclone/swirl) is more aligned with "twist" as narrative surprise.
export const TONE_EMOJI: Record<string, string> = {
  hopeful: '🌱',
  neutral: '⚖️',
  dark: '🌑',
  twist: '🌀',
};

export const TONE_TEXT_CSS_DARK: Record<string, string> = {
  hopeful: 'text-emerald-200',
  neutral: 'text-gray-100',
  dark: 'text-red-200',
  twist: 'text-purple-200',
};

export const TONE_TEXT_CSS_LIGHT: Record<string, string> = {
  hopeful: 'text-emerald-800',
  neutral: 'text-gray-800',
  dark: 'text-red-800',
  twist: 'text-purple-800',
};
