'use client';

import { useState } from 'react';
import { useI18n } from '@/i18n/provider';
import Link from 'next/link';

interface Story {
  id: string;
  avatar: string;
  i18nKey: string;
  tagKey: string;
}

const STORIES: Story[] = [
  { id: 's1', avatar: '🦊', i18nKey: 'awakeningStories.story1', tagKey: 'inward.storiesTag1' },
  { id: 's2', avatar: '🌙', i18nKey: 'awakeningStories.story2', tagKey: 'inward.storiesTag2' },
  { id: 's3', avatar: '🌊', i18nKey: 'awakeningStories.story3', tagKey: 'inward.storiesTag3' },
];

export function AwakeningStories() {
  const { t, locale } = useI18n();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="px-4 mt-6 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-text-primary">
          {t('inward.storiesTitle', { defaultValue: 'Guardians’ Stories' })}
        </h3>
        <p className="text-xs text-text-secondary mt-1">
          {t('inward.storiesSubtitle', { defaultValue: 'Real guarding, real freedom' })}
        </p>
      </div>

      <div className="space-y-3">
        {STORIES.map(story => (
          <div
            key={story.id}
            className="rounded-2xl bg-glass-fill/40 border border-glass-border/50 p-4"
          >
            <div className="flex items-start gap-3">
              <span className="text-xl flex-shrink-0">{story.avatar}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-text-tertiary mb-1">“</p>
                <p className="text-xs font-semibold text-text-primary mb-1">
                  {t(`${story.i18nKey}.title`)}
                </p>
                <p className="text-xs text-text-primary leading-relaxed">
                  {t(`${story.i18nKey}.body`)}
                </p>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-[10px] text-text-tertiary">
                    by {t(`${story.i18nKey}.name`)}
                  </span>
                  <span className="text-[10px] text-cyan-400 font-medium">{t(story.tagKey)}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="text-center">
        {expanded ? (
          <p className="text-xs text-text-tertiary py-2">
            {t('inward.storiesMoreComing', { defaultValue: 'More stories coming soon — be the first to share yours!' })}
          </p>
        ) : (
          <button
            onClick={() => setExpanded(true)}
            className="text-xs font-bold text-text-secondary hover:text-text-primary transition-colors"
          >
            {t('inward.storiesMore', { defaultValue: 'Read more stories' })}
          </button>
        )}
        {expanded && (
          <Link
            href={`/${locale}/signup`}
            className="text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors mt-1 inline-block"
          >
            {t('inward.storiesBeFirst', { defaultValue: 'Be the first →' })}
          </Link>
        )}
      </div>
    </div>
  );
}
