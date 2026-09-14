'use client';

/**
 * DailyRitualOverlay — 每日守护仪式
 *
 * 绿色守护叙事的核心仪式 (batch6-c, 2026-09-06: 旧魔镜自由叙事已替换):
 * - 每天第一次打开 Symy 时触发 (测试期间: 每 5 分钟触发一次)
 * - 全屏覆盖，纯色背景
 * - 展示守护天数 (streak 口径) + 一行 app 内留下的钱累计 + 每日轮换守护文案
 * - "收到啦" 按钮关闭
 *
 * 数据持久化:
 * - 认证用户: 服务端 profiles.last_ritual_at (跨设备同步)
 * - Demo 用户: localStorage (仅本设备)
 *
 * 设计原则 (工程师必读):
 * - 不要加"跳过"按钮 — 仪式不能跳过
 * - 不要加动画/特效 — 仪式是安静的
 * - 不要加"今日推荐"或"任务" — 仪式不是任务，是停顿
 * - 全屏留白 — 让用户停下来
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/i18n/provider';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency } from '@/lib/format';
import { getRitualGuardianLine } from '@/lib/daily-reflections';
import { logger } from '@/lib/logger';

export interface DailyRitualOverlayProps {
  /** 用户名 (用于 "早安, {name}") */
  userName?: string;
  /** 总省下的钱 */
  totalSaved: number;
  /** 是否为 demo 模式 */
  isDemo?: boolean;
  /** 时薪 — 守护叙事不再换算自由小时, prop 保留兼容既有调用 */
  hourlyRate?: number;
  /** 🔧 PM-P0-2 fix: 当 onboarding/ahaMoment 等高优先级弹窗在显示时, 暂停 ritual */
  paused?: boolean;
  /** 守护天数 (既有 streak 口径, 与 BuddyTab / 绿色日报同源); 0/缺省按第 1 天展示 */
  streakDays?: number;
}

// Demo 模式用的 localStorage key
const DEMO_STORAGE_KEY = 'symy-daily-ritual';

// 🔧 2026-07-15: Demo 模式也从 5 分钟改为每日 1 次 (与服务端逻辑一致)
//   旧代码: DEMO_INTERVAL_MS = 5 分钟 → Demo 用户每 5 分钟看到 1 次仪式
//   新代码: 用 getLimitWindow() 比较日期窗口, 每天最多 1 次
//   效果: 与登录用户体验一致, 每天 1 次 (UTC 4:00 AM 重置)

export function DailyRitualOverlay({
  userName,
  totalSaved,
  isDemo = false,
  paused = false,
  streakDays,
}: DailyRitualOverlayProps) {
  const { t, locale } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);
  const [closed, setClosed] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  // 🔧 ARCH fix (Round 26 AUDIT-5 HIGH-3): track setTimeout for cleanup
  //    旧代码: setTimeout 未保存 → 卸载后 setState on unmounted component
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mount check (SSR safety)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-time mount setState (SSR guard), see ARCH-DEEP-71
    setMounted(true);
    // 🔧 HIGH-3: cleanup fade timer on unmount
    return () => {
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
    };
  }, []);

  // Check if ritual should show — fetch from server for auth users, localStorage for demo
  useEffect(() => {
    if (!mounted) return;

    let cancelled = false;

    async function checkRitual() {
      try {
        if (isDemo) {
          // 🔧 2026-07-15: Demo 模式也用每日窗口判断 (与服务端一致)
          //   旧代码: 5 分钟间隔 → Demo 用户频繁看到仪式
          //   新代码: 用 getLimitWindow() 比较, 每天最多 1 次
          const { getLimitWindow } = await import('@/lib/limit-window');
          const todayWindow = getLimitWindow();
          const lastShown = localStorage.getItem(DEMO_STORAGE_KEY);
          const shouldShowDemo = lastShown !== todayWindow;
          if (!cancelled) setShouldShow(shouldShowDemo);
        } else {
          // Authenticated: check server
  // eslint-disable-next-line symy/no-raw-fetch-in-use-effect
          const data = await apiFetch<{ shouldShow: boolean; lastRitualAt: string | null; intervalMs: number }>(
            '/api/user/ritual-status'
          );
          if (!cancelled) setShouldShow(data.shouldShow);
        }
      } catch (err) {
        // If API fails, don't show ritual (fail silent — better than blocking user)
        logger.warn('[DailyRitualOverlay] Failed to check ritual status:', err);
        if (!cancelled) setShouldShow(false);
      }
    }

    checkRitual();
    return () => { cancelled = true; };
  }, [mounted, isDemo]);

  // eslint-disable-next-line symy/no-async-callback-mutation
  const handleClose = useCallback(async () => {
    setFadingOut(true);

    // Mark ritual as shown
    try {
      if (isDemo) {
        // 🔧 2026-07-15: 存储今日窗口 key (而非时间戳), 与 checkRitual 逻辑一致
        const { getLimitWindow } = await import('@/lib/limit-window');
        localStorage.setItem(DEMO_STORAGE_KEY, getLimitWindow());
      } else {
        await apiFetch('/api/user/ritual-status', { method: 'POST' });
      }
      // safe to ignore: non-critical background operation, error already logged
    } catch (err) {
                    // safe to ignore: non-critical background operation, error already logged
      logger.warn('[DailyRitualOverlay] Failed to mark ritual as shown:', err);
    }

    // 🔧 HIGH-3: save timer ref for cleanup
    // 🔧 ADV-REVIEW LOW-1: clear existing timer before setting new one (double-click safe)
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = setTimeout(() => {
      fadeTimerRef.current = null;
      setClosed(true);
      setFadingOut(false);
    }, 400);
  }, [isDemo]);

  // Don't render until mounted (SSR safety)
  // 🔧 PM-P0-2 fix: paused=true 时不渲染 (onboarding/ahaMoment 优先级更高)
  if (!mounted || closed || !shouldShow || paused) return null;

  // 守护叙事: 天数用既有 streak 口径 (page.tsx 传 buddyState.streak), 0/缺省按第 1 天
  // 展示 (新旅程 framing, 不出 0 — 荣誉非羞辱)。金额行平移自旧 totalSaved 展示位,
  // 措辞换成守护口径, 仍只作 app 内展示 (仪式无分享出口)。
  const guardianDays = Math.max(1, streakDays ?? 0);
  const savedStr = formatCurrency(totalSaved, { decimals: false });
  const guardianLine = getRitualGuardianLine();
  const guardianLineText = locale === 'zh' ? guardianLine.zh : guardianLine.en;

  // Greeting name strategy (🔧 batch6-c 守护叙事):
  //   1) userName 如果是邮箱 → 用 "守护者" / "Guardian" (绿色守护的称呼, i18n)
  //   2) userName 如果是普通昵称 (不含 @) → 用该昵称
  //   3) userName 为空 → 不显示名字 (只说 "早安。")
  const computeGreetingName = (rawName: string | undefined): string => {
    if (!rawName) return '';
    const trimmed = rawName.trim();
    if (!trimmed) return '';
    // 邮箱 → 用守护叙事称呼 (i18n)
    if (trimmed.includes('@')) {
      return t('ritual.guardianName', { defaultValue: 'Guardian' });
    }
    // 普通昵称 → 首字母大写后返回 (保留原样如果已是大写或中文)
    const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    return capitalized;
  };

  const displayName = userName || '';
  const greetingName = computeGreetingName(displayName);

  // 🔧 Round 115 fix: 使用浏览器本地时区计算问候语 (而非 UTC)
  //    旧代码: 永远显示 "Good morning" — 不考虑当前时间
  //    新代码: 5-12 morning / 12-17 afternoon / 17-22 evening / 22-5 night
  //    使用 Intl.DateTimeFormat 确保跨时区正确
  const currentHour = typeof window !== 'undefined'
    ? parseInt(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false }).format(new Date()), 10)
    : 12; // SSR fallback: noon (不显示 morning/night 避免闪烁)
  const timeOfDay = currentHour >= 5 && currentHour < 12 ? 'morning'
    : currentHour >= 12 && currentHour < 17 ? 'afternoon'
    : currentHour >= 17 && currentHour < 22 ? 'evening'
    : 'night';

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- greetingMap kept for reference, t() keys used instead
  const greetingMap: Record<string, { en: string; zh: string }> = {
    morning: { en: 'Good morning', zh: '早安' },
    afternoon: { en: 'Good afternoon', zh: '午安' },
    evening: { en: 'Good evening', zh: '晚上好' },
    night: { en: 'Good night', zh: '夜深了' },
  };
  // 🔧 2026-07-15 (ARCH-6 #5): Replaced locale === 'zh' ternaries with i18n keys
  const greetingKey = `ritual.greeting${timeOfDay.charAt(0).toUpperCase()}${timeOfDay.slice(1)}`;
  const greetingWord = t(greetingKey);

  const sep = locale === 'zh' ? '，' : ', ';
  const end = locale === 'zh' ? '。' : '.';
  const morningGreeting = greetingName ? `${greetingWord}${sep}${greetingName}${end}` : `${greetingWord}${end}`;

  const beforeToday = t('ritual.beforeToday');
  const guardianIntro = t('ritual.guardianIntro');
  const guardianDay = t('ritual.guardianDay', { days: guardianDays, defaultValue: `Day ${guardianDays}` });
  const guardianStreakLabel = t('ritual.guardianStreakLabel');
  const savedByGuarding = t('ritual.savedByGuarding', { amount: savedStr });
  const closeButton = t('ritual.closeButton');

  return createPortal(
    <div
      // 🔧 P2 fix: 全屏覆盖 — 用 inline style 保证 position:fixed 生效 (避免 Tailwind class 被覆盖)
      //    z-[9999] 确保盖过 TabBar / bottom nav / 任何 modal
      //    bg-surface-1 是纯色 (light: #f5f7fa, dark: #0a0e1a) — 不透明, 完全遮罩
      // 🔧 P0 fix (2026-07-10): fadingOut 时设 pointer-events:none, 防止不可见的遮罩拦截点击
      //    旧代码: fadingOut 时 opacity:0 但仍 pointer-events:auto → 400ms 内点击被拦截, 用户感知"按钮无响应"
      //    新代码: fadingOut 时 pointer-events:none, 让点击穿透到下方真实 UI
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        backgroundColor: 'var(--surface-1)',
        pointerEvents: fadingOut ? 'none' : 'auto',
      }}
      // owner bugfix 09-06: overlay blocked chat input ("cannot type" reports) - tap anywhere dismisses
      onClick={handleClose}
      role='button'
      className={`flex items-center justify-center transition-opacity duration-400 ${fadingOut ? 'opacity-0' : 'opacity-100'}`}
    >
      <div className="w-full h-full max-w-md mx-auto flex flex-col items-center justify-center px-8 py-12 text-center">

        {/* Greeting */}
        <p className="text-lg text-text-secondary font-light mb-2">
          {morningGreeting}
        </p>

        <p className="text-sm text-text-tertiary mb-12">
          {beforeToday}
        </p>

        {/* Divider */}
        <div className="w-16 h-px bg-glass-border mb-12" />

        {/* Guardian data — 守护第 N 天 (streak 口径) + 一行留下的钱 (app 内展示) */}
        <p className="text-sm text-text-tertiary mb-1">
          {guardianIntro}
        </p>
        <p className="text-5xl font-bold gradient-text mb-1 inline-flex items-baseline gap-2">
          <span>🐘</span>
          {guardianDay}
        </p>
        <p className="text-sm text-text-tertiary mb-3">
          {guardianStreakLabel}
        </p>
        <p className="text-sm text-text-tertiary mb-12">
          {savedByGuarding}
        </p>

        {/* Divider */}
        <div className="w-16 h-px bg-glass-border mb-12" />

        {/* Daily guardian line */}
        <p className="text-base text-text-primary leading-relaxed font-light max-w-xs">
          {guardianLineText}
        </p>

        {/* Spacer */}
        <div className="flex-1 min-h-8" />

        {/* Divider */}
        <div className="w-16 h-px bg-glass-border mb-8" />

        {/* "Got it" button — the only interaction */}
        <button
          onClick={handleClose}
          className="px-8 py-3 text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer border border-glass-border rounded-full hover:border-glass-border-strong bg-glass-fill/50"
        >
          {closeButton}
        </button>
      </div>
    </div>,
    document.body
  );
}
