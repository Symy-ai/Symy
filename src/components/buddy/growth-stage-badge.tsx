/**
 * P1-5: Growth Stage Badge — 显示 Symy 成长阶段
 *
 * 在 Symy 头像下方显示当前阶段名 + 阶段图标
 * 鼠标 hover 显示阶段说明 tooltip
 */

'use client';

import { useI18n } from '@/i18n/provider';
import type { GrowthStage } from '@/types/buddy-state';

interface GrowthStageBadgeProps {
  growthStage: GrowthStage;
}

const STAGE_EMOJI: Record<GrowthStage, string> = {
  baby: '🌱',
  young: '⭐',
  adult: '✨',
  elder: '🪷',
};

// batch3-b: 梯度统一绿色系 — 随阶段向松绿 #143527 加深, 与小象/勋章卡同一语言
const STAGE_GRADIENT: Record<GrowthStage, string> = {
  baby: 'from-green-400/90 to-emerald-500/90',
  young: 'from-emerald-500/90 to-teal-600/90',
  adult: 'from-teal-600/90 to-emerald-700/90',
  elder: 'from-emerald-700/90 to-[#143527]/90',
};

export function GrowthStageBadge({ growthStage }: GrowthStageBadgeProps) {
  const { t } = useI18n();
  const stageName = t(`buddy.growthStage.${growthStage}`, { defaultValue: growthStage });
  const stageDesc = t(`buddy.growthStageDesc.${growthStage}`, { defaultValue: '' });

  return (
    <div
      className={`inline-flex items-center gap-1 bg-gradient-to-r ${STAGE_GRADIENT[growthStage]} border border-glass-border px-2.5 py-0.5 rounded-full shadow-lg pointer-events-none whitespace-nowrap`}
      title={stageDesc}
    >
      <span className="text-[10px]">{STAGE_EMOJI[growthStage]}</span>
      <span className="text-[10px] font-bold text-white">{stageName}</span>
    </div>
  );
}
