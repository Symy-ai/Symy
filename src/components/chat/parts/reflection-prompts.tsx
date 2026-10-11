'use client';

import { useState, useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
// 🔧 P0-1 fix (2026-07-20): 从共享文件导入反思问题 (SSOT, 避免重复定义)
import { REFLECTION_QUESTIONS_EN, REFLECTION_QUESTIONS_ZH } from './reflection-questions';

/**
 * 🔧 P1-3 fix: Reflection prompts for the failure path ("I choose to buy")
 *
 * After the user clicks "I choose to buy", Symy shows 3 randomly selected
 * reflection questions. The user can click one to send it as a message,
 * or ignore them entirely.
 *
 * Design principles:
 * - Non-judgmental: questions help the user reflect, not shame them
 * - Optional: user can skip all prompts
 * - Varied: 12 questions in the pool, 3 randomly selected each time
 * - Categorized: emotional / social / habitual / price-based
 */

interface ReflectionPromptsProps {
  onSelect: (question: string) => void;
}

export function ReflectionPrompts({ onSelect }: ReflectionPromptsProps) {
  const { t, locale } = useI18n();
  const [dismissed, setDismissed] = useState(false);
  // 🔧 R1049 收编 (R1048 观察项22 + locale prop 删除): 壳层三元硬编码双语 → t() key;
  //   locale prop 是测试专用注入面 (生产唯一调用 chat-messages 不传) — 删除后问题池与
  //   壳层全跟 context locale, 语言一致性天然保证 (F6 的 context 兜底成为唯一路径).
  const effectiveLocale = locale === 'zh' ? 'zh' : 'en';

  // Pick 3 random questions (memoized — stable per mount)
  const questions = useMemo(() => {
    const pool = effectiveLocale === 'zh' ? REFLECTION_QUESTIONS_ZH : REFLECTION_QUESTIONS_EN;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  }, [effectiveLocale]);

  if (dismissed) return null;

  // 🔧 R1049 收编 (R1048 观察项22, i18n 漂移第 6 例): 壳层三元硬编码双语 → t() key
  //   (chat.reflectionPrompts.title/subtitle/skip). 问题池本身已 i18n SSOT, 此处是壳层残留.
  const title = t('chat.reflectionPrompts.title');
  const subtitle = t('chat.reflectionPrompts.subtitle');

  return (
    <div className="flex justify-center mb-4 px-4">
      <div className="max-w-md w-full bg-orange-500/5 dark:bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-orange-500" />
          <span className="text-sm font-medium text-text-primary">{title}</span>
          <span className="text-xs text-text-muted ml-auto">{subtitle}</span>
        </div>
        <div className="space-y-2">
          {questions.map((q, i) => (
            <button
              key={i}
              onClick={() => {
                onSelect(q);
                setDismissed(true);
              }}
              className="w-full text-left px-3 py-2 rounded-xl bg-white/50 dark:bg-white/5 hover:bg-orange-500/10 dark:hover:bg-orange-500/15 border border-orange-500/10 hover:border-orange-500/30 transition-colors text-sm text-text-secondary hover:text-text-primary"
            >
              {q}
            </button>
          ))}
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="mt-3 w-full text-center text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          {t('chat.reflectionPrompts.skip')}
        </button>
      </div>
    </div>
  );
}
