/**
 * SVG 插图生成引擎 — 程序化生成 Dark Concept Art 风格插图
 *
 * 当 AI 图片生成 API 不可用时（Pollinations.ai 付费限制、z-ai SDK 网络不可达），
 * 此引擎生成基于 SVG 的高质量概念艺术风格插图。
 *
 * 特点：
 * - 100% 可靠：不依赖任何外部 API
 * - 即时生成：毫秒级响应
 * - 主题化：根据故事基调（hopeful/dark/twist/neutral）调整视觉风格
 * - 涟漪主题：每张图都包含涟漪/光圈图案（V11: 移除蝴蝶）
 * - 可升级：AI API 可用时自动替换为 AI 生成的图片
 */

import type { StoryTone } from '../types';

// ============================================================
// 基调颜色配置
// ============================================================

const TONE_CONFIG_DARK: Record<StoryTone, {
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
  glowColor: string;
  particleColor: string;
}> = {
  hopeful: {
    primary: '#10b981',
    secondary: '#34d399',
    accent: '#fbbf24',
    bg: '#0a1a0f',
    glowColor: 'rgba(16, 185, 129, 0.4)',
    particleColor: 'rgba(52, 211, 153, 0.6)',
  },
  dark: {
    primary: '#ef4444',
    secondary: '#dc2626',
    accent: '#991b1b',
    bg: '#1a0a0a',
    glowColor: 'rgba(239, 68, 68, 0.4)',
    particleColor: 'rgba(220, 38, 38, 0.6)',
  },
  twist: {
    primary: '#a855f7',
    secondary: '#c084fc',
    accent: '#7c3aed',
    bg: '#0f0a1a',
    glowColor: 'rgba(168, 85, 247, 0.4)',
    particleColor: 'rgba(192, 132, 252, 0.6)',
  },
  neutral: {
    primary: '#6b7280',
    secondary: '#9ca3af',
    accent: '#4b5563',
    bg: '#0a0e1a',
    glowColor: 'rgba(107, 114, 128, 0.4)',
    particleColor: 'rgba(156, 163, 175, 0.6)',
  },
};

const TONE_CONFIG_LIGHT: Record<StoryTone, {
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
  glowColor: string;
  particleColor: string;
}> = {
  hopeful: {
    primary: '#34d399',
    secondary: '#6ee7b7',
    accent: '#fbbf24',
    bg: '#f0fdf4',
    glowColor: 'rgba(16, 185, 129, 0.25)',
    particleColor: 'rgba(52, 211, 153, 0.35)',
  },
  dark: {
    primary: '#f87171',
    secondary: '#fca5a5',
    accent: '#991b1b',
    bg: '#fef2f2',
    glowColor: 'rgba(239, 68, 68, 0.2)',
    particleColor: 'rgba(248, 113, 113, 0.35)',
  },
  twist: {
    primary: '#c084fc',
    secondary: '#d8b4fe',
    accent: '#7c3aed',
    bg: '#faf5ff',
    glowColor: 'rgba(168, 85, 247, 0.2)',
    particleColor: 'rgba(192, 132, 252, 0.35)',
  },
  neutral: {
    primary: '#9ca3af',
    secondary: '#d1d5db',
    accent: '#4b5563',
    bg: '#f9fafb',
    glowColor: 'rgba(107, 114, 128, 0.2)',
    particleColor: 'rgba(156, 163, 175, 0.35)',
  },
};

// ============================================================
// SVG 生成
// ============================================================

/**
 * 生成 SVG 插图并返回 data URL
 */
export function generateSVGIllustration(
  title: string,
  tone: StoryTone,
  chapterIndex: number,
  isLight?: boolean,
): string {
  const config = isLight
    ? (TONE_CONFIG_LIGHT[tone] || TONE_CONFIG_LIGHT.neutral)
    : (TONE_CONFIG_DARK[tone] || TONE_CONFIG_DARK.neutral);
  const seed = hashCode(title + tone + chapterIndex);

  // 生成随机粒子
  const particles = generateParticles(seed, 25, config.particleColor);

  // 生成涟漪/光圈（V11: 替代蝴蝶翅膀）
  const ripple = generateRipple(config);

  // 生成场景元素
  const sceneElements = generateSceneElements(title, seed, config, isLight);

  // Light mode uses lighter vignette and ground gradient
  const bgEdgeColor = isLight ? '#ffffff' : '#000000';
  const groundColor = isLight ? '#ffffff' : '#000000';
  const vignetteColor = isLight ? '#ffffff' : '#000000';
  const vignetteOpacity = isLight ? '0.2' : '0.4';
  const figureColor = isLight ? '#374151' : '#000000';
  const figureOpacity = isLight ? '0.15' : '0.3';
  const noiseOpacity = isLight ? '0.02' : '0.05';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 672" width="384" height="672">
  <defs>
    <radialGradient id="bg-grad" cx="50%" cy="30%" r="70%">
      <stop offset="0%" stop-color="${config.bg}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${bgEdgeColor}" stop-opacity="1"/>
    </radialGradient>
    <radialGradient id="glow-grad" cx="50%" cy="40%" r="40%">
      <stop offset="0%" stop-color="${config.glowColor}" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="${config.glowColor}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ripple-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${config.primary}" stop-opacity="0.8"/>
      <stop offset="50%" stop-color="${config.secondary}" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="${config.accent}" stop-opacity="0.4"/>
    </linearGradient>
    <linearGradient id="ground-grad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${config.bg}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${groundColor}" stop-opacity="0.8"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="soft-glow">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feBlend in="SourceGraphic" mode="multiply" result="blend"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="384" height="672" fill="url(#bg-grad)"/>

  <!-- Atmospheric glow -->
  <ellipse cx="192" cy="200" rx="250" ry="175" fill="url(#glow-grad)" filter="url(#soft-glow)"/>

  <!-- Scene elements -->
  ${sceneElements}

  <!-- Particles -->
  ${particles}

  <!-- Ripple/Light orb (V11: replaced butterfly) -->
  ${ripple}

  <!-- Figure silhouette -->
  <g transform="translate(192, 340)" opacity="${figureOpacity}">
    <ellipse cx="0" cy="-30" rx="18" ry="22" fill="${figureColor}"/>
    <rect x="-20" y="-8" width="40" height="80" rx="8" fill="${figureColor}"/>
    <rect x="-28" y="0" width="12" height="50" rx="4" fill="${figureColor}" transform="rotate(-10, -28, 0)"/>
    <rect x="16" y="0" width="12" height="50" rx="4" fill="${figureColor}" transform="rotate(10, 28, 0)"/>
  </g>

  <!-- Bottom gradient overlay -->
  <rect y="450" width="384" height="222" fill="url(#ground-grad)"/>

  <!-- Noise texture overlay -->
  <rect width="384" height="672" opacity="${noiseOpacity}" filter="url(#noise)"/>

  <!-- Vignette -->
  <rect width="384" height="672" fill="none" stroke="${vignetteColor}" stroke-width="100" opacity="${vignetteOpacity}" rx="0"/>
</svg>`;

  // BUG-295 fix: 安全处理 Unicode 字符，btoa 对非 ASCII 字符会抛异常
  const base64 = typeof Buffer !== 'undefined'
    ? Buffer.from(svg, 'utf-8').toString('base64')
    : btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${base64}`;
}

// ============================================================
// 辅助函数
// ============================================================

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function generateParticles(seed: number, count: number, color: string): string {
  const rng = seededRandom(seed);
  const particles: string[] = [];

  for (let i = 0; i < count; i++) {
    const x = rng() * 384;
    const y = rng() * 672;
    const r = 1 + rng() * 3;
    const opacity = 0.2 + rng() * 0.5;

    particles.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" opacity="${opacity.toFixed(2)}" filter="url(#glow)"/>`
    );
  }

  return particles.join('\n  ');
}

function generateRipple(config: typeof TONE_CONFIG_DARK.hopeful): string {
  return `<g transform="translate(275, 125)" filter="url(#soft-glow)">
    <!-- Concentric ripples (light orb) -->
    <circle cx="0" cy="0" r="40" fill="none" stroke="${config.primary}" stroke-width="1.5" opacity="0.5"/>
    <circle cx="0" cy="0" r="28" fill="none" stroke="${config.secondary}" stroke-width="1" opacity="0.4"/>
    <circle cx="0" cy="0" r="16" fill="none" stroke="${config.primary}" stroke-width="0.8" opacity="0.3"/>
    <!-- Core glow -->
    <circle cx="0" cy="0" r="8" fill="${config.primary}" opacity="0.25" filter="url(#soft-glow)"/>
    <circle cx="0" cy="0" r="3" fill="${config.secondary}" opacity="0.5"/>
    <!-- Expanding ripples -->
    <circle cx="0" cy="0" r="55" fill="none" stroke="${config.primary}" stroke-width="0.5" opacity="0.2"/>
    <circle cx="0" cy="0" r="70" fill="none" stroke="${config.secondary}" stroke-width="0.3" opacity="0.1"/>
  </g>`;
}

function generateSceneElements(title: string, seed: number, config: typeof TONE_CONFIG_DARK.hopeful, isLight?: boolean): string {
  const rng = seededRandom(seed);
  const elements: string[] = [];
  const lower = title.toLowerCase();

  // Always add some atmospheric elements
  // Floating light rays
  for (let i = 0; i < 3; i++) {
    const x = 50 + rng() * 284;
    const opacity = isLight ? (0.02 + rng() * 0.03) : (0.03 + rng() * 0.05);
    elements.push(
      `<line x1="${x}" y1="0" x2="${x + (rng() - 0.5) * 50}" y2="672" stroke="${config.primary}" stroke-width="${10 + rng() * 20}" opacity="${opacity.toFixed(3)}"/>`
    );
  }

  // Add rain if title suggests it
  if (lower.includes('rain') || lower.includes('storm')) {
    for (let i = 0; i < 15; i++) {
      const x = rng() * 384;
      const y = rng() * 672;
      elements.push(
        `<line x1="${x}" y1="${y}" x2="${x - 3}" y2="${y + 15 + rng() * 10}" stroke="${config.particleColor}" stroke-width="1" opacity="${(0.2 + rng() * 0.3).toFixed(2)}"/>`
      );
    }
  }

  // Add stars/night sky if title suggests it
  if (lower.includes('night') || lower.includes('dark') || lower.includes('moon') || lower.includes('midnight')) {
    const starColor = isLight ? '#6b7280' : '#ffffff';
    for (let i = 0; i < 8; i++) {
      const x = rng() * 384;
      const y = rng() * 200;
      elements.push(
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.5 + rng() * 1.5).toFixed(1)}" fill="${starColor}" opacity="${(0.3 + rng() * 0.5).toFixed(2)}"/>`
      );
    }
  }

  // Door/window light
  if (lower.includes('door') || lower.includes('gate') || lower.includes('window')) {
    elements.push(
      `<rect x="150" y="250" width="84" height="150" rx="4" fill="${config.primary}" opacity="0.1"/>`,
      `<rect x="155" y="255" width="74" height="140" rx="2" fill="${config.glowColor}" opacity="0.15" filter="url(#soft-glow)"/>`
    );
  }

  return elements.join('\n  ');
}
