'use client';

/**
 * StageUpCelebration — 成长阶段升级的卡内庆祝动效 (batch3-b)
 *
 * 动效语言参考 chat/variable-reward-overlay (粒子爆发 + ring 扩散 + 文字弹入),
 * 但按需求在本卡内实现: 绝对定位覆盖头像区、pointer-events-none 不阻塞交互、
 * 不引 overlay 组件。颜色统一拦截勋章卡的绿色语言。
 *
 * 文案即里子: 庆祝卡片直接写明 "每一级成长来自你真实省下的钱"。
 */

import { useEffect } from 'react';
import { useI18n } from '@/i18n/provider';
import type { GrowthStage } from '@/types/buddy-state';

interface StageUpCelebrationProps {
  /** 升级到的新阶段 (庆祝卡片显示该阶段名) */
  stage: GrowthStage;
  show: boolean;
}

const STAGE_PIN_EMOJI: Record<GrowthStage, string> = {
  baby: '🌱',
  young: '⭐',
  adult: '✨',
  elder: '🪷',
};

// 12 颗粒子: 角度均分, 距离/大小/颜色交错 — 确定性生成, 无随机数 (避免 SSR/重渲差异)
const PARTICLE_COLORS = ['#4ADE80', '#34D399', '#2DD4BF', '#A7F3D0'];
const PARTICLES = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
  const dist = i % 2 === 0 ? 76 : 54;
  return {
    tx: `${(Math.cos(angle) * dist).toFixed(1)}px`,
    ty: `${(Math.sin(angle) * dist).toFixed(1)}px`,
    size: 4 + (i % 3) * 1.5,
    color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
    delay: `${((i % 4) * 0.04).toFixed(2)}s`,
  };
});

export function StageUpCelebration({ stage, show }: StageUpCelebrationProps) {
  const { t } = useI18n();

  // 移动端触觉反馈 (reduced-motion 用户跳过, 与可变奖励 overlay 同策略)
  useEffect(() => {
    if (!show) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (!reduced && navigator.vibrate) {
      navigator.vibrate([15, 30, 15]);
    }
  }, [show]);

  if (!show) return null;

  const stageName = t(`buddy.growthStage.${stage}`, { defaultValue: stage });

  return (
    <div
      className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center"
      data-testid="stage-up-celebration"
      role="status"
      aria-label={t('buddy.stageUpTitle', { stage: stageName, defaultValue: `Grew into ${stageName}!` })}
    >
      {/* 双 ring 扩散 */}
      <div
        className="absolute left-1/2 top-1/2 w-24 h-24 rounded-full border-2 border-emerald-400/80"
        style={{ animation: 'stage-up-ring 0.9s var(--ease-out-expo) forwards' }}
      />
      <div
        className="absolute left-1/2 top-1/2 w-24 h-24 rounded-full border border-teal-300/60"
        style={{ animation: 'stage-up-ring 1.1s var(--ease-out-expo) 0.22s forwards' }}
      />
      {/* 粒子爆发 */}
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: p.size,
            height: p.size,
            background: p.color,
            boxShadow: `0 0 6px ${p.color}`,
            ['--tx' as string]: p.tx,
            ['--ty' as string]: p.ty,
            animation: `stage-up-particle 1.1s var(--ease-out-expo) ${p.delay} forwards`,
          }}
        />
      ))}
      {/* 庆祝卡片 — 文字写明里子 (w-max 挣脱 96px 头像窄容器, 防止竖排挤压) */}
      <div
        className="relative z-10 w-max max-w-[280px] px-4 py-3 rounded-2xl text-center backdrop-blur-md bg-[#0c2017]/85 border border-emerald-400/40 shadow-2xl"
        style={{ animation: 'stage-up-card-in 0.55s var(--ease-spring) 0.1s backwards' }}
      >
        <div
          className="text-3xl mb-1"
          style={{ animation: 'stage-up-emoji-pop 0.6s var(--ease-spring) 0.25s backwards' }}
        >
          {STAGE_PIN_EMOJI[stage]}
        </div>
        <p className="text-sm font-bold text-emerald-300 leading-tight whitespace-nowrap">
          {t('buddy.stageUpTitle', { stage: stageName, defaultValue: `Grew into ${stageName}!` })}
        </p>
        <p className="text-[10px] text-emerald-100/75 mt-1 leading-relaxed">
          {t('buddy.stageUpSub', { defaultValue: 'Every level is powered by money you really kept' })}
        </p>
      </div>
    </div>
  );
}
