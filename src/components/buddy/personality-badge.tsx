/**
 * P1-5: Personality Badge — 显示 Symy 个性
 *
 * 个性觉醒后显示, 未觉醒 (unknown) 不显示
 * 鼠标 hover 显示个性说明 tooltip
 */

'use client';

import { useI18n } from '@/i18n/provider';
import type { Personality } from '@/types/buddy-state';

interface PersonalityBadgeProps {
  personality: Personality;
}

const PERSONALITY_EMOJI: Record<Personality, string> = {
  unknown: '',
  sage: '🧙',
  playmate: '🎭',
  guardian: '🛡️',
  ascetic: '🧘',
};

const PERSONALITY_GRADIENT: Record<Personality, string> = {
  unknown: '',
  sage: 'from-teal-600/90 to-cyan-700/90',
  playmate: 'from-orange-500/90 to-pink-500/90',
  guardian: 'from-emerald-500/90 to-teal-500/90',
  ascetic: 'from-slate-500/90 to-gray-500/90',
};

export function PersonalityBadge({ personality }: PersonalityBadgeProps) {
  const { t } = useI18n();

  // 未觉醒不显示
  if (personality === 'unknown') return null;

  const personalityName = t(`buddy.personality.${personality}`, { defaultValue: personality });
  const personalityDesc = t(`buddy.personalityDesc.${personality}`, { defaultValue: '' });

  return (
    <div
      className={`inline-flex items-center gap-1 bg-gradient-to-r ${PERSONALITY_GRADIENT[personality]} border border-glass-border px-2.5 py-0.5 rounded-full shadow-lg pointer-events-none`}
      title={personalityDesc}
    >
      <span className="text-[10px]">{PERSONALITY_EMOJI[personality]}</span>
      <span className="text-[10px] font-bold text-white">{personalityName}</span>
    </div>
  );
}
