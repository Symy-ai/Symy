'use client';

import { useMemo } from 'react';
import { useI18n } from '@/i18n/provider';
import type { HealthEvent, BuddyState } from '@/types/buddy-state';
import { getBadgeGoal } from '@/lib/badge-goal';
import { ALL_BADGES } from '@/lib/badge-constants';

const SESSION_FIRST_MESSAGE_SENT = 'symy-chat-first-message-sent';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface SmartPromptChipsProps {
  /** Whether any user message has been sent in this session */
  hasSentMessage: boolean;
  /** Current buddy state (streak, badges, etc.) */
  buddyState: BuddyState | null | undefined;
  /** Health events used to detect recent intercepts */
  healthEvents: HealthEvent[];
  /** After the first intercept event in this session, show an extra follow-up chip */
  hasHadInterceptInSession: boolean;
  /** Called when user taps a chip; input is filled and sent automatically */
  onQuickReply: (text: string) => void;
}

export function SmartPromptChips({
  buddyState,
  healthEvents,
  hasHadInterceptInSession,
  onQuickReply,
}: SmartPromptChipsProps) {
  const { t } = useI18n();

  const chips = useMemo(() => {
    if (typeof window !== 'undefined' && window.sessionStorage.getItem(SESSION_FIRST_MESSAGE_SENT) === 'true') {
      return [];
    }

    // 1) Unfinished badge goal
    if (buddyState) {
      const badgeId = getBadgeGoal();
      if (badgeId) {
        const badge = ALL_BADGES.find((b) => b.id === badgeId);
        if (badge?.name) {
          return [
            {
              id: 'badgeGoal',
              text: t('chat.smartPrompt.badgeGoal', { defaultValue: 'Help me finish 「{goal}」', goal: badge.name }),
            },
          ];
        }
      }
    }

    // 2) Intercept events in last 7 days
    const now = Date.now();
    const recentIntercepts = healthEvents.filter(
      (event) => event.eventType === 'challenge_completed' && now - new Date(event.createdAt).getTime() <= SEVEN_DAYS_MS,
    );
    if (recentIntercepts.length > 0) {
      return [
        {
          id: 'recentIntercepts',
          text: t('chat.smartPrompt.recentIntercepts', { defaultValue: 'What did I guard in the last 7 days?' }),
        },
      ];
    }

    // 3) Streak >= 3 days
    if (buddyState && buddyState.streak >= 3) {
      return [
        {
          id: 'heatmap',
          text: t('chat.smartPrompt.heatmap', { defaultValue: 'Show me my guard heatmap' }),
        },
      ];
    }

    // 4) Fallback
    return [
      {
        id: 'fallback',
        text: t('chat.smartPrompt.fallback', { defaultValue: 'What do you want to save today?' }),
      },
    ];
  }, [buddyState, healthEvents, t]);

  const extraChip = useMemo(() => {
    if (hasHadInterceptInSession) {
      return {
        id: 'afterIntercept',
        text: t('chat.smartPrompt.afterIntercept', { defaultValue: 'Can you help me find a greener alternative for that?' }),
      };
    }
    return null;
  }, [hasHadInterceptInSession, t]);

  if (chips.length === 0 && !extraChip) {
    return null;
  }

  return (
    <div className="relative z-10 px-4 pb-2 animate-in fade-in slide-in-from-bottom-2 duration-200 ease-out">
      <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar-horizontal">
        {chips.map((chip) => (
          <button
            key={chip.id}
            onClick={() => onQuickReply(chip.text)}
            className="flex-shrink-0 px-3 py-1.5 rounded-full border border-emerald-600/40 bg-emerald-950/60 text-emerald-100 text-xs hover:border-yellow-500/30 hover:text-text-primary transition-all"
          >
            {chip.text}
          </button>
        ))}
        {extraChip && (
          <button
            key={extraChip.id}
            onClick={() => onQuickReply(extraChip.text)}
            className="flex-shrink-0 px-3 py-1.5 rounded-full border border-emerald-600/40 bg-emerald-950/60 text-emerald-100 text-xs hover:border-yellow-500/30 hover:text-text-primary transition-all"
          >
            {extraChip.text}
          </button>
        )}
      </div>
    </div>
  );
}
