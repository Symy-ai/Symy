/**
 * StoryViewer helpers — TONE_COLORS + scene splitting utilities.
 *
 * 🔧 Round 80 F4: extracted from story-viewer.tsx (was 982 lines, target <800).
 *    Pure functions + constant — no React, no hooks, easy to test.
 */

import type { StoryTone } from '../../types';

// ============================================================
// 基调颜色映射
// ============================================================

export const TONE_COLORS: Record<StoryTone, {
  text: string;
  glowCSS: string;
  gradientCSS: string;
  accentColor: string;
  accentBg: string;
  borderColor: string;
  dotColor: string;
  particleColor: string;
}> = {
  hopeful: {
    text: 'text-emerald-300',
    glowCSS: '0 0 30px rgba(16, 185, 129, 0.4)',
    gradientCSS: 'linear-gradient(to top, rgba(16,185,129,0.15) 0%, transparent 100%)',
    accentColor: '#6ee7b7',
    accentBg: 'rgba(16,185,129,0.2)',
    borderColor: 'rgba(16,185,129,0.3)',
    dotColor: '#34d399',
    particleColor: 'rgba(16,185,129,0.6)',
  },
  neutral: {
    text: 'text-gray-300',
    glowCSS: '0 0 30px rgba(156, 163, 175, 0.3)',
    gradientCSS: 'linear-gradient(to top, rgba(156,163,175,0.1) 0%, transparent 100%)',
    accentColor: '#d1d5db',
    accentBg: 'rgba(156,163,175,0.15)',
    borderColor: 'rgba(156,163,175,0.25)',
    dotColor: '#9ca3af',
    particleColor: 'rgba(156,163,175,0.4)',
  },
  dark: {
    text: 'text-red-300',
    glowCSS: '0 0 30px rgba(239, 68, 68, 0.4)',
    gradientCSS: 'linear-gradient(to top, rgba(239,68,68,0.15) 0%, transparent 100%)',
    accentColor: '#fca5a5',
    accentBg: 'rgba(239,68,68,0.2)',
    borderColor: 'rgba(239,68,68,0.3)',
    dotColor: '#f87171',
    particleColor: 'rgba(239,68,68,0.6)',
  },
  twist: {
    text: 'text-purple-300',
    glowCSS: '0 0 30px rgba(168, 85, 247, 0.4)',
    gradientCSS: 'linear-gradient(to top, rgba(168,85,247,0.15) 0%, transparent 100%)',
    accentColor: '#d8b4fe',
    accentBg: 'rgba(168,85,247,0.2)',
    borderColor: 'rgba(168,85,247,0.3)',
    dotColor: '#c084fc',
    particleColor: 'rgba(168,85,247,0.6)',
  },
};

// ============================================================
// 场景分割工具
// ============================================================

export function splitScenes(content: string): string[] {
  // 用 ||| 分割场景
  const scenes = content.split('|||').map(s => s.trim()).filter(s => s.length > 0);
  // 如果没有 ||| 分隔符（旧格式兼容），按句子分组
  if (scenes.length <= 1 && content.length > 80) {
    return groupIntoScenes(content);
  }
  return scenes.length > 0 ? scenes : [content];
}

/** 旧格式兼容：将长文本按句子分组为场景 */
export function groupIntoScenes(text: string): string[] {
  const sentences = text.match(/[^.!?。！？]+[.!?。！？]+/g) || [text];
  const scenes: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    current += sentence;
    if (current.length > 50 || sentences.indexOf(sentence) === sentences.length - 1) {
      scenes.push(current.trim());
      current = '';
    }
  }
  return scenes.filter(s => s.length > 0);
}
