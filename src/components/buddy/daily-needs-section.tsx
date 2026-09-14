/**
 * P1-5: Daily Needs Section — 日常需求进度条 (增强版)
 *
 * 显示 Symy 的 3 个日常需求: 清晰度 / 连接 / 呼吸
 * - 3 项都 ≥ 60: Harmony 状态 (一起守护中, 显示绿色)
 * - 任一 ≤ 30: Discomfort 状态 (Symy 在休息攒劲, 显示琥珀暖光)
 * - 其他: Neutral (安静陪伴, 显示黄色)
 *
 * 🔧 QA enhancement: 渐变进度条 + 发光效果 + 低需求脉冲动画 + tooltip
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import type { DailyNeeds, NeedType, HarmonyStatus } from '@/types/buddy-state';
import { getHarmonyStatus } from '@/lib/buddy-defaults';

interface DailyNeedsSectionProps {
  dailyNeeds: DailyNeeds;
}

const NEED_EMOJI: Record<NeedType, string> = {
  clarity: '🔍',
  connection: '💞',
};

/** 需求条渐变 + 发光: 高=绿, 中=黄, 低=琥珀暖光(休息攒劲) — Round 93: 加 solidFrom/solidTo/glowColor */
function getNeedGradient(value: number): {
  gradient: string; glow: string; text: string;
  solidFrom: string; solidTo: string; glowColor: string;
} {
  if (value >= 60) return {
    gradient: 'from-green-500 to-emerald-400',
    glow: 'shadow-[0_0_8px_rgba(34,197,94,0.4)]',
    text: 'text-green-400',
    solidFrom: '#22c55e', solidTo: '#34d399', glowColor: 'rgba(34,197,94,0.4)',
  };
  if (value >= 30) return {
    gradient: 'from-yellow-500 to-amber-400',
    glow: 'shadow-[0_0_6px_rgba(234,179,8,0.3)]',
    text: 'text-yellow-400',
    solidFrom: '#eab308', solidTo: '#fbbf24', glowColor: 'rgba(234,179,8,0.3)',
  };
  return {
    gradient: 'from-amber-500 to-orange-400',
    glow: 'shadow-[0_0_8px_rgba(245,158,11,0.5)]',
    text: 'text-amber-400',
    solidFrom: '#f59e0b', solidTo: '#fb923c', glowColor: 'rgba(245,158,11,0.5)',
  };
}

/** 和谐状态样式 */
function getHarmonyStyle(status: HarmonyStatus): { color: string; emoji: string; bg: string; border: string } {
  switch (status) {
    case 'harmony':
      return { color: 'text-green-400', emoji: '🌸', bg: 'bg-green-500/10', border: 'border-green-500/20' };
    case 'discomfort':
      return { color: 'text-amber-400', emoji: '🌱', bg: 'bg-amber-500/10', border: 'border-amber-500/20' };
    default:
      return { color: 'text-yellow-400', emoji: '🙂', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' };
  }
}

export function DailyNeedsSection({ dailyNeeds }: DailyNeedsSectionProps) {
  const { t } = useI18n();
  const harmonyStatus = getHarmonyStatus(dailyNeeds);
  const harmonyStyle = getHarmonyStyle(harmonyStatus);
  const needs: NeedType[] = ['clarity', 'connection'];
  const [hoveredNeed, setHoveredNeed] = useState<NeedType | null>(null);
  // 🔧 PM5-P2-3 fix: Tooltip popover for each need
  const [tooltipNeed, setTooltipNeed] = useState<NeedType | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tooltipNeed) return;
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setTooltipNeed(null); };
    const handleClickOutside = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) setTooltipNeed(null);
    };
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [tooltipNeed]);

  return (
    <div className={`px-4 py-3 rounded-2xl bg-glass-fill border transition-colors duration-300 ${harmonyStyle.border}`}>
      {/* 标题行: 日常需求 + 和谐状态徽章 */}
      <div className="flex items-center justify-between mb-2.5">
        {/* 🔧 PM-#23 fix: 移除 uppercase (统计标题用 Sentence case) */}
        <h3 className="text-xs font-semibold text-text-secondary tracking-wider">
          {t('buddy.dailyNeedsTitle', { defaultValue: "Symy's daily needs" })}
        </h3>
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${harmonyStyle.bg} ${harmonyStyle.border} border ${harmonyStyle.color} text-[10px] font-medium`}>
          <span className="text-xs">{harmonyStyle.emoji}</span>
          <span>{t(`buddy.harmonyStatus.${harmonyStatus}`, { defaultValue: harmonyStatus })}</span>
        </div>
      </div>

      {/* 3 个需求条 */}
      <div className="space-y-2">
        {needs.map(need => {
          const value = dailyNeeds[need];
          const style = getNeedGradient(value);
          const name = t(`buddy.dailyNeeds.${need}`, { defaultValue: need });
          const hint = t(`buddy.dailyNeedsHint.${need}`, { defaultValue: '' });
          const isLow = value <= 30;
          const isHovered = hoveredNeed === need;

          return (
            <div
              key={need}
              className="flex items-center gap-2"
              onMouseEnter={() => setHoveredNeed(need)}
              onMouseLeave={() => setHoveredNeed(null)}
            >
              <span
                className="text-sm w-5 text-center"
                style={{
                  transition: 'transform 0.4s var(--ease-spring)',
                  transform: isHovered ? 'scale(1.3) rotate(-8deg)' : 'scale(1)',
                  animation: isLow ? 'critical-heartbeat 1.4s var(--ease-in-out-soft) infinite' : 'none',
                }}
              >
                {NEED_EMOJI[need]}
              </span>
              <div className="flex-1">
                <div className="flex items-center justify-between text-[10px] mb-0.5">
                  <span className={`font-medium transition-colors flex items-center gap-0.5 ${isLow ? 'text-amber-400' : 'text-text-secondary'}`}>
                    {name}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setTooltipNeed(need); }}
                      className="w-3 h-3 rounded-full bg-glass-fill border border-glass-border text-text-tertiary hover:text-cyan-400 hover:border-cyan-400/40 transition-colors flex items-center justify-center text-[8px] cursor-pointer"
                      aria-label={t('buddy.dailyNeedsTooltipTitle', { defaultValue: 'What does this mean?' })}
                    >
                      ⓘ
                    </button>
                  </span>
                  <span className={`tabular-nums font-mono ${style.text}`}>{Math.round(value)}%</span>
                </div>
                <div
                  className={`h-2 rounded-full bg-glass-border overflow-hidden relative ${isLow ? 'ring-1 ring-amber-500/30' : ''}`}
                  title={hint}
                >
                  <div
                    className={`h-full rounded-full relative overflow-hidden ${isLow ? 'animate-pulse' : ''}`}
                    style={{
                      width: `${value}%`,
                      background: `linear-gradient(90deg, ${style.solidFrom}, ${style.solidTo})`,
                      transition: 'width 0.8s var(--ease-out-expo)',
                      boxShadow: `0 0 8px ${style.glowColor}`,
                    }}
                  >
                    {/* Round 93: 流动光带 */}
                    <div
                      className="absolute inset-0"
                      style={{
                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                        backgroundSize: '200% 100%',
                        animation: 'bar-flow 2s linear infinite',
                      }}
                    />
                    {/* Round 93: 顶端光点 */}
                    {value > 0 && (
                      <div
                        className="absolute right-0 top-1/2 w-1.5 h-1.5 rounded-full bg-white"
                        style={{
                          transform: 'translateY(-50%)',
                          boxShadow: `0 0 6px 1px ${style.glowColor}`,
                        }}
                      />
                    )}
                  </div>
                </div>
                {/* Tooltip hint on hover */}
                {isHovered && hint && (
                  <p className="text-[9px] text-text-tertiary mt-0.5 leading-tight">{hint}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 低需求提示 */}
      {harmonyStatus === 'discomfort' && (
        <div className="mt-2.5 pt-2 border-t border-amber-500/10">
          <p className="text-[10px] text-amber-400/80 italic flex items-start gap-1">
            <span className="text-xs">💡</span>
            <span>{t('buddy.dailyNeedsLowHint', { defaultValue: 'Symy is resting up. Chat with Symy, take a Guard-it challenge, or start a What If story — your companion is right here.' })}</span>
          </p>
        </div>
      )}

      {/* 🔧 PM5-P2-3 fix: Need detail tooltip popover (portal-based) */}
      {tooltipNeed && createPortal(
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setTooltipNeed(null)}
        >
          <div
            ref={tooltipRef}
            className="relative w-full max-w-xs bg-surface-2 border border-glass-border rounded-2xl shadow-2xl p-5 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top accent */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 rounded-t-2xl" />
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                <span className="text-base">{NEED_EMOJI[tooltipNeed]}</span>
                {t(`buddy.dailyNeeds.${tooltipNeed}`, { defaultValue: tooltipNeed })}
              </h4>
              <button
                onClick={() => setTooltipNeed(null)}
                className="w-6 h-6 rounded-full bg-glass-fill border border-glass-border text-text-tertiary hover:text-text-primary transition-colors flex items-center justify-center"
                aria-label={t('common.close', { defaultValue: 'Close' })}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="border-t border-glass-border mb-3" />
            {/* Description */}
            <p className="text-xs text-text-secondary leading-relaxed mb-3">
              {t(`buddy.dailyNeedsDesc.${tooltipNeed}`, { defaultValue: '' })}
            </p>
            {/* How to increase */}
            <div className="px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
              <p className="text-[10px] text-cyan-400 font-medium mb-0.5">💡 {t('buddy.dailyNeedsTooltipTitle', { defaultValue: 'What does this mean?' })}</p>
              <p className="text-[11px] text-text-secondary leading-relaxed">
                {t(`buddy.dailyNeedsHowTo.${tooltipNeed}`, { defaultValue: '' })}
              </p>
            </div>
            {/* Current value */}
            <div className="mt-3 flex items-center justify-between text-[10px]">
              <span className="text-text-tertiary">{t('buddy.dailyNeedsCurrentValue', { defaultValue: 'Current level' })}</span>
              <span className={`font-mono font-bold ${getNeedGradient(dailyNeeds[tooltipNeed]).text}`}>{Math.round(dailyNeeds[tooltipNeed])}%</span>
            </div>
            {/* Got it button */}
            <button
              onClick={() => setTooltipNeed(null)}
              className="w-full mt-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs font-medium hover:bg-cyan-500/30 transition-colors"
            >
              {t('common.gotIt', { defaultValue: 'Got it' })}
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
