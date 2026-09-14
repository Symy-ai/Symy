'use client';
/**
 * Hero Section — AI Companion Visualization (Round 96: 深化 2.5D + 3D)
 *
 * 2.5D 升级:
 * - 头像容器 perspective(300px) + 鼠标 rotateX/rotateY ±8deg 倾斜
 * - 移动端: DeviceOrientation 陀螺仪驱动倾斜
 * - SVG 内部分层视差: glow(-10px) / ring(2px) / face(5px) / badge(20px)
 * - 鼠标位置驱动 inner face 平行位移 (±4px)
 * - 光斑高光: 跟随鼠标位置的高光点 (translateZ(15px))
 *
 * Vitality Ring 3D 升级:
 * - 双层环: 前层 rotateX(12deg) + 后层 rotateX(-12deg) (镜像)
 * - 后层模糊 (filter: blur) 营造景深
 * - 高光点沿环旋转 (CSS animation)
 */

import { useRef, useCallback, useState, useMemo, useEffect } from 'react';
import { useI18n } from '@/i18n/provider';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
import type { BuddyState, GrowthStage } from '@/types/buddy-state';
import { GROWTH_STAGE_THRESHOLDS } from '@/lib/buddy-defaults';
import { moneyToFreedomLabel } from '@/lib/freedom-time';
import { BatteryIcon } from './constants';
import { SymyAvatar } from './symy-avatar';
import { GrowthStageBadge } from './growth-stage-badge';
import { PersonalityBadge } from './personality-badge';
import { StageUpCelebration } from './stage-up-celebration';

// Round 97: 成长阶段进化顺序 (用于计算下一阶段)
const STAGE_ORDER: GrowthStage[] = ['baby', 'young', 'adult', 'elder'];

interface HeroSectionProps {
  buddyState: BuddyState;
  config: {
    color: string;
    glowColor: string;
    statusTextKey: string;
    statusEmoji: string;
    ringColor: string;
    particleColor: string;
    neonGradient: string;
  };
  vitalityPct: number;
  /** Round 97 P2-5 fix: companionBubble/onCloseCompanionBubble 已移除 (点击头像改为打开 modal) */
  onCompanionClick: () => void;
  /** Round 105: Pet Symy 触发时的脉冲动画 (点击头像触发抚摸) */
  healingPulse?: boolean;
}

export function HeroSection({
  buddyState,
  config,
  vitalityPct,
  onCompanionClick,
  healingPulse = false,
}: HeroSectionProps) {
  const { t, locale } = useI18n();
  const { hourlyRate } = useHourlyRate();
  const avatarRef = useRef<HTMLButtonElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, mx: 0, my: 0, hx: 50, hy: 50 });
  const [isPointer, setIsPointer] = useState(false);

  // Round 96: 鼠标移动时计算倾斜角度 + 光斑位置
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const el = avatarRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);  // -1 ~ 1
    const dy = (e.clientY - cy) / (rect.height / 2);  // -1 ~ 1
    // 限制最大倾斜 ±8deg
    setTilt({
      rx: -dy * 8,
      ry: dx * 8,
      mx: dx * 4,  // SVG 内层位移 (px)
      my: dy * 4,
      hx: ((e.clientX - rect.left) / rect.width) * 100,  // 光斑位置 0-100%
      hy: ((e.clientY - rect.top) / rect.height) * 100,
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTilt({ rx: 0, ry: 0, mx: 0, my: 0, hx: 50, hy: 50 });
    setIsPointer(false);
  }, []);

  const handleMouseEnter = useCallback(() => setIsPointer(true), []);

  // Round 97 P0-2/P0-3 fix: 移动端陀螺仪 — 用 localStorage 记住拒绝状态, 避免重复弹权限框
  // Round 97 P1-4 fix: handleOrientation 提升到组件作用域, unmount 时 removeEventListener
  const orientationEnabledRef = useRef(false);
  const orientationDeniedRef = useRef(false);
  const orientationHandlerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);

  // Round 97 P1-4 fix: 稳定的 orientation handler (存到 ref, unmount 时移除)
  const handleOrientation = useCallback((e: DeviceOrientationEvent) => {
    const beta = e.beta ?? 0;
    const gamma = e.gamma ?? 0;
    const rx = Math.max(-8, Math.min(8, (beta - 45) * 0.2));
    const ry = Math.max(-8, Math.min(8, gamma * 0.2));
    setTilt({ rx, ry, mx: ry * 0.5, my: -rx * 0.5, hx: 50, hy: 50 });
    setIsPointer(false);
  }, []);

  // Round 97 P1-4 fix: unmount 时移除 listener, 避免内存泄漏
  useEffect(() => {
    return () => {
      if (orientationHandlerRef.current && orientationEnabledRef.current) {
        window.removeEventListener('deviceorientation', orientationHandlerRef.current);
        orientationEnabledRef.current = false;
      }
    };
  }, []);

  const requestOrientationPermission = useCallback(async () => {
    if (orientationEnabledRef.current) return;
    if (orientationDeniedRef.current) return;
    if (typeof window === 'undefined') return;
    const isTouchDevice = window.matchMedia?.('(hover: none)')?.matches;
    if (!isTouchDevice) return;

    try {
      if (localStorage.getItem('symy_orientation_denied') === '1') {
        orientationDeniedRef.current = true;
        return;
      }
    } catch { /* localStorage 不可用 */ }

    orientationHandlerRef.current = handleOrientation;

    const D = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof D.requestPermission === 'function') {
      try {
        const result = await D.requestPermission();
        if (result === 'granted' && orientationHandlerRef.current) {
          window.addEventListener('deviceorientation', orientationHandlerRef.current);
          orientationEnabledRef.current = true;
        } else {
          orientationDeniedRef.current = true;
          try { localStorage.setItem('symy_orientation_denied', '1'); } catch { /* */ }
        }
      } catch {
        orientationDeniedRef.current = true;
        try { localStorage.setItem('symy_orientation_denied', '1'); } catch { /* */ }
      }
    } else if (orientationHandlerRef.current) {
      window.addEventListener('deviceorientation', orientationHandlerRef.current);
      orientationEnabledRef.current = true;
    }
  }, [handleOrientation]);

  const handleAvatarClick = useCallback(() => {
    requestOrientationPermission();
    onCompanionClick();
  }, [requestOrientationPermission, onCompanionClick]);

  // 🔧 PM-NEW-54 fix: 防御性 guard
  const safeConfig = config ?? {
    color: 'text-gray-400',
    glowColor: 'shadow-gray-400/30',
    statusTextKey: 'buddy.healthStatus.dormant',
    statusEmoji: '💀',
    ringColor: 'stroke-gray-400',
    particleColor: 'bg-gray-400',
    neonGradient: 'from-gray-400 to-gray-500',
  };
  const particleColor = safeConfig.particleColor || 'bg-gray-400';

  // batch3-b: 成长阶段升级检测 — 升级瞬间触发卡内庆祝 (3s 自动退场, 不阻塞交互)
  const [stageUp, setStageUp] = useState<GrowthStage | null>(null);
  const prevStageRef = useRef<GrowthStage>(buddyState.growthStage);
  useEffect(() => {
    const prev = prevStageRef.current;
    prevStageRef.current = buddyState.growthStage;
    // 首挂载 prev === current 不触发; 仅 stage 序号上升时庆祝
    if (STAGE_ORDER.indexOf(buddyState.growthStage) > STAGE_ORDER.indexOf(prev)) {
      setStageUp(buddyState.growthStage);
      const tid = setTimeout(() => setStageUp(null), 3000);
      return () => clearTimeout(tid);
    }
  }, [buddyState.growthStage]);

  // Round 97 游戏化: 计算下一成长阶段 (用于进化提示)
  const { nextStageThreshold, nextStageName } = useMemo(() => {
    const currentIdx = STAGE_ORDER.indexOf(buddyState.growthStage);
    if (currentIdx < 0 || currentIdx >= STAGE_ORDER.length - 1) {
      return { nextStageThreshold: null, nextStageName: '' };
    }
    const nextStage = STAGE_ORDER[currentIdx + 1];
    const threshold = GROWTH_STAGE_THRESHOLDS[nextStage];
    const name = t(`buddy.growthStage.${nextStage}`, { defaultValue: nextStage });
    return { nextStageThreshold: threshold, nextStageName: name };
  }, [buddyState.growthStage, t]);

  return (
    <div className="relative z-10 px-4 pt-5 pb-3">
      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {buddyState.health !== 'dormant' && (
          <>
            <div className={`absolute w-1.5 h-1.5 ${particleColor} rounded-full opacity-60 animate-float-1`} style={{ left: '15%', top: '20%' }} />
            <div className={`absolute w-1 h-1 ${particleColor} rounded-full opacity-40 animate-float-2`} style={{ left: '75%', top: '15%' }} />
            <div className={`absolute w-2 h-2 ${particleColor} rounded-full opacity-30 animate-float-3`} style={{ left: '60%', top: '35%' }} />
            <div className={`absolute w-1 h-1 ${particleColor} rounded-full opacity-50 animate-float-1`} style={{ left: '30%', top: '40%', animationDelay: '1s' }} />
            <div className={`absolute w-1.5 h-1.5 ${particleColor} rounded-full opacity-35 animate-float-2`} style={{ left: '85%', top: '30%', animationDelay: '0.5s' }} />
          </>
        )}
      </div>

      {/* Avatar area */}
      <div className="flex flex-col items-center relative z-10">
        {/* Outer pulse rings */}
        {buddyState.health !== 'dormant' && (
          <>
            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 rounded-full border ${safeConfig.ringColor.replace('stroke-', 'border-')} opacity-20 animate-pulse-ring`} />
            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-36 h-36 rounded-full border ${safeConfig.ringColor.replace('stroke-', 'border-')} opacity-10 animate-pulse-ring`} style={{ animationDelay: '1.5s' }} />
          </>
        )}
        {/* Round 97 P2-5 fix: companionBubble 死代码已移除 (点击头像改为打开 modal) */}

        {/* 2.5D Avatar container — perspective + tilt
            Round 97 P0-2 fix: LV badge 改为文档流 (不再 absolute), 自然占据空间避免与 Status line 重叠
            内层 button-wrapper 用于 side badges 的绝对定位基准 (只有 button 大小) */}
        <div
          className="relative flex flex-col items-center"
          style={{ perspective: '300px', perspectiveOrigin: '50% 40%' }}
          onMouseMove={handleMouseMove}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* button wrapper — side badges 的定位基准 (batch3-b: 升级瞬间叠加蹦跳动画) */}
          <div className={`relative ${stageUp ? 'stage-up-hop' : ''}`}>
          <button
            ref={avatarRef}
            onClick={handleAvatarClick}
            className={`buddy-avatar-btn relative w-24 h-24 rounded-full shadow-2xl ${safeConfig.glowColor} animate-buddy-float cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-400/40 focus:ring-offset-2 focus:ring-offset-transparent -m-2 p-2 ${healingPulse ? 'ring-4 ring-purple-400/60 scale-105' : ''}`}
            aria-label={t('buddy.companionAriaLabel', { defaultValue: 'View Symy details' })}
            type="button"
            style={{
              transformStyle: 'preserve-3d',
              transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
              transition: 'transform 0.2s var(--ease-spring), ring 0.3s var(--ease-spring), scale 0.3s var(--ease-spring)',
            }}
          >
            {/* Outer glow blur — Round 97: 健康状态越差, 光晕越急促 */}
            <div
              className={`absolute -inset-4 rounded-full blur-2xl bg-gradient-to-r ${safeConfig.neonGradient} pointer-events-none`}
              style={{
                transform: 'translateZ(-10px)',
                opacity: buddyState.health === 'critical' ? 0.6 : buddyState.health === 'weak' ? 0.5 : 0.4,
                animation: buddyState.health === 'critical'
                  ? 'critical-pulse 1s var(--ease-in-out-soft) infinite'
                  : buddyState.health === 'weak'
                    ? 'weak-pulse 1.5s var(--ease-in-out-soft) infinite'
                    : buddyState.health === 'dormant'
                      ? 'none'
                      : 'pulse 3s var(--ease-in-out-soft) infinite',
                willChange: 'transform, opacity',
              }}
            />
            {/* Round 96: Vitality Ring — 双层 3D 透视环 (前 + 后镜像, 后层模糊景深) */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 128 128"
              style={{ transform: 'rotateX(-12deg) rotateZ(-90deg) translateZ(-2px)', filter: 'blur(2px)', opacity: 0.5 }}
            >
              <circle
                cx="64" cy="64" r="56" fill="none"
                className={safeConfig.ringColor}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={`${vitalityPct * 3.52} 352`}
                style={{ transition: 'stroke-dasharray 1.2s var(--ease-spring)' }}
              />
            </svg>
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 128 128"
              style={{ transform: 'rotateX(12deg) rotateZ(-90deg) translateZ(2px)' }}
            >
              <circle cx="64" cy="64" r="56" fill="none" stroke="currentColor" className="text-text-primary/5" strokeWidth="4" />
              <circle
                cx="64" cy="64" r="56" fill="none"
                className={safeConfig.ringColor}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${vitalityPct * 3.52} 352`}
                style={{
                  transition: 'stroke-dasharray 1.2s var(--ease-spring)',
                  filter: 'drop-shadow(0 0 6px currentColor) drop-shadow(0 0 12px currentColor)',
                  opacity: 0.9,
                }}
              />
              <circle
                cx="64" cy="64" r="56" fill="none"
                stroke="white" strokeWidth="1.5" strokeLinecap="round"
                strokeDasharray={`${vitalityPct * 3.52} 352`}
                style={{ transition: 'stroke-dasharray 1.2s var(--ease-spring)', opacity: 0.3 }}
              />
              {/* Round 96: 高光点沿环旋转 (只在 vitality > 0 时显示) */}
              {vitalityPct > 0 && (
                <circle
                  cx="64" cy="64" r="56" fill="none"
                  stroke="white" strokeWidth="2" strokeLinecap="round"
                  strokeDasharray="4 348"
                  strokeDashoffset={-vitalityPct * 3.52}
                  style={{
                    opacity: 0.8,
                    filter: 'drop-shadow(0 0 4px white) drop-shadow(0 0 8px white)',
                    animation: 'ring-highlight-orbit 4s var(--ease-in-out-soft) infinite',
                    transformOrigin: '64px 64px',
                  }}
                />
              )}
            </svg>
            {/* Inner face — SVG avatar with 2.5D parallax layers */}
            <div
              className="absolute inset-3 rounded-full overflow-hidden pointer-events-none"
              style={{
                transform: `translate(${tilt.mx * 0.3}px, ${tilt.my * 0.3}px) translateZ(5px)`,
                transition: 'transform 0.2s var(--ease-spring)',
              }}
            >
              <SymyAvatar growthStage={buddyState.growthStage} animate={buddyState.health !== 'dormant'} />
            </div>
            {/* Round 96: 跟随鼠标的光斑高光 (鼠标在时才显示) */}
            {isPointer && (
              <div
                className="absolute inset-3 rounded-full pointer-events-none mix-blend-screen"
                style={{
                  transform: 'translateZ(15px)',
                  background: `radial-gradient(circle at ${tilt.hx}% ${tilt.hy}%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.1) 30%, transparent 60%)`,
                  transition: 'background 0.1s linear',
                }}
              />
            )}
            {/* Round 97: 移除 badge 容器 — 改为兄弟元素定位 (避免 3D translateZ 导致的位置偏移) */}
          </button>

          {/* ====== Round 97: Badge 布局重构 ====== */}
          {/* GrowthStage badge — 大象左侧 (absolute 相对于 button-wrapper) */}
          <div
            className="absolute top-1/2 right-full mr-1 -translate-y-1/2 z-20 pointer-events-none"
          >
            <GrowthStageBadge growthStage={buddyState.growthStage} />
          </div>

          {/* Personality badge — 大象右侧 (未觉醒时不显示, 留空营造期待感) */}
          {buddyState.personality !== 'unknown' && (
            <div
              className="absolute top-1/2 left-full ml-1 -translate-y-1/2 z-20 pointer-events-none"
            >
              <PersonalityBadge personality={buddyState.personality} />
            </div>
          )}

          {/* 关闭 button-wrapper (side badges 的定位基准) */}
          </div>

          {/* batch3-b: 卡内升级庆祝 — 覆盖头像区, pointer-events-none 不阻塞交互 */}
          <StageUpCelebration stage={stageUp ?? buddyState.growthStage} show={stageUp !== null} />

          {/* LV badge — 大象下方, 调小 (Round 97: 文档流定位, 自然占据空间)
              Round 97 P0-2 fix: 从 absolute top-full 改为 mt-2 文档流, 避免与 Status line 重叠 */}
          <div
            className="mt-2 z-20 pointer-events-none flex items-center justify-center"
            role="img"
            aria-label={t('buddy.levelLabel', { level: buddyState.level, defaultValue: `Level ${buddyState.level}` })}
          >
            {/* relative 包裹: LV badge 是唯一居中主体, 提示文字 absolute 挂在右侧不参与居中 */}
            <div className="relative">
              <div className="bg-glass-fill-strong border border-glass-border rounded-full shadow-md flex flex-col items-center gap-0.5 py-0.5 px-2">
                <span className="text-[9px] font-bold text-text-secondary tracking-wide leading-none" aria-hidden="true">LV.{buddyState.level}</span>
                {/* Round 97 游戏化: 迷你 XP 进度条 (Genshin Impact 风格) */}
                <div
                  className="w-7 h-[2px] rounded-full bg-glass-border overflow-hidden"
                  role="progressbar"
                  aria-label={t('buddy.xpProgress', { defaultValue: 'XP progress to next level' })}
                  aria-valuenow={Math.round((buddyState.xp / (buddyState.xpToNext || 1)) * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, (buddyState.xp / (buddyState.xpToNext || 1)) * 100)}%`,
                      background: 'linear-gradient(90deg, #27AE60, #4ADE80)',
                      boxShadow: '0 0 4px rgba(74, 222, 128, 0.6)',
                      transition: 'width 700ms var(--ease-spring)',
                    }}
                  />
                </div>
              </div>
              {/* Round 97 游戏化: 成长阶段进化提示 (接近下一阶段时显示)
                  Round 106 fix: LV badge 单独居中, 提示文字 absolute 定位在 LV badge 右侧, 不参与居中计算 */}
              {nextStageThreshold && buddyState.level >= nextStageThreshold - 2 && buddyState.level < nextStageThreshold && (
                <span
                  className="absolute top-1/2 left-full ml-1.5 -translate-y-1/2 whitespace-nowrap text-[9px] text-emerald-500/80 dark:text-emerald-400/70 italic"
                  style={{ animation: 'evolution-hint 2s var(--ease-in-out-soft) infinite' }}
                  role="status"
                  aria-label={t('buddy.evolutionHint', { stage: nextStageName, defaultValue: `✦ ${nextStageName} soon...` })}
                >
                  {t('buddy.evolutionHint', { stage: nextStageName, defaultValue: `✦ ${nextStageName} soon...` })}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Status line */}
        <div className="mt-2 flex items-center gap-1.5">
          <BatteryIcon health={buddyState.health} />
          <span className={`text-sm font-bold ${safeConfig.color}`}>{t(safeConfig.statusTextKey)}</span>
          <span className="text-xs text-text-tertiary">{safeConfig.statusEmoji}</span>
        </div>
        <p className="text-xs text-text-tertiary mt-0.5">
          {buddyState.health === 'dormant'
            ? t('buddy.depositToRevive')
            : buddyState.health === 'critical'
              ? t('buddy.impulseHurting')
              : buddyState.health === 'weak'
                ? t('buddy.spendingWearingDown')
                : buddyState.health === 'thriving'
                  ? t('buddy.mindfulKeepsStrong')
                  : t('buddy.growingStronger')}
        </p>
        {/* batch3-b: 里子可见化 — 小象长大的每一级 = 你真实赢回的生命时间
            数据来自已有 buddyState (totalSaved / challengesCompleted), 零 DDL。
            owner 铁律 (09-06): app 内也只显示自由时间, 钱数只在梦想基金语境出现。 */}
        <div
          className="mt-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500/12 to-green-500/12 border border-emerald-500/25"
          data-testid="growth-source-summary"
        >
          <p className="text-[10px] text-emerald-400 font-medium text-center leading-relaxed">
            {t('buddy.growthSourceTitle', { defaultValue: 'Every level Symy grows = life hours you really won back' })}
          </p>
          <p className="text-[10px] text-text-secondary text-center mt-0.5 leading-relaxed">
            {t('buddy.growthSourceSaved', {
              amount: moneyToFreedomLabel(buddyState.totalSaved, locale, hourlyRate),
              defaultValue: `{amount} of life won back`,
            })}
            {' · '}
            {t('buddy.growthSourceIntercepts', { n: buddyState.challengesCompleted, defaultValue: `{n} interceptions` })}
          </p>
        </div>
      </div>
    </div>
  );
}
