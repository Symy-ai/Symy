/**
 * useButterflySession — 常量定义（从 use-butterfly-session.ts 抽出，C1 拆分）
 *
 * 纯常量，无运行时逻辑。行为零变化。
 */

import type { ButterflyUIState } from '../../types';

// ============================================================
// 默认 UI 状态
// ============================================================

export const DEFAULT_UI_STATE: ButterflyUIState = {
  phase: 'idle',
  isLoading: false,
  streamingText: '',
  currentChapterIndex: 0,
  error: null,
  outlineVisible: false,
};

// ============================================================
// API endpoints (normal vs demo)
// 🔧 ARCH fix (Round 12 XSTATE-12): 加 preloadBranch 字段
//    旧代码 actor 硬编码 '/api/butterfly/preload-branch', 绕过 endpoints 配置
//    → demo/normal 模式不能区分 preload endpoint
// ============================================================

export const API = {
  session: '/api/butterfly/session',
  story: '/api/butterfly/story',
  choice: '/api/butterfly/choice',
  illustration: '/api/butterfly/illustration',
  preloadBranch: '/api/butterfly/preload-branch',
} as const;

export const DEMO_API = {
  session: '/api/butterfly/demo-session',
  story: '/api/butterfly/demo-story',
  choice: '/api/butterfly/demo-choice',
  illustration: '/api/butterfly/illustration-demo',
  preloadBranch: '', // demo 模式不预加载分支 (spawnPreloadBranches 在 demo 模式短路)
} as const;

// ============================================================
// Illustration polling 常量 (Round 12 XSTATE-10)
// 🔧 ARCH fix: 旧代码 illustrationPollingActor 硬编码 maxRetries=5 + 5000ms
//    → 25s 放弃, 但 LLM 图片生成常需 30-60s, 用户看到“插图永不上来”
//    根因修复: 抽常量, 总时长 120s 覆盖 LLM p99
// ============================================================

export const ILLUSTRATION_POLLING_INTERVAL_MS = 5000;
export const ILLUSTRATION_POLLING_MAX_RETRIES = 24; // 24 × 5s = 120s

// ============================================================
// 🔧 架构优化 Round 58: 共享 fallback 字符串 (Finding 12)
// ============================================================

/** Butterfly effect fallback — used when session.butterflyEffect is null */
export const BUTTERFLY_EFFECT_FALLBACK = 'Your butterfly effect story is complete. Every decision shaped the outcome.';
