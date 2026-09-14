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
  locale?: 'en' | 'zh';
}

export function ReflectionPrompts({ onSelect, locale }: ReflectionPromptsProps) {
  const { t: _t, locale: ctxLocale } = useI18n();
  const [dismissed, setDismissed] = useState(false);
  // 🔧 F6 fix: 优先用 prop locale, fallback 到 i18n context locale (旧代码默认 'en' 覆盖了 context)
  const effectiveLocale = locale || (ctxLocale === 'zh' ? 'zh' : 'en');

  // Pick 3 random questions (memoized — stable per mount)
  const questions = useMemo(() => {
    const pool = effectiveLocale === 'zh' ? REFLECTION_QUESTIONS_ZH : REFLECTION_QUESTIONS_EN;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  }, [effectiveLocale]);

  if (dismissed) return null;

  const title = effectiveLocale === 'zh' ? '想看看为什么吗？' : 'Want to look at why?';
  const subtitle = effectiveLocale === 'zh' ? '（可选 — 点击一个问题开始反思）' : '(optional — tap a question to reflect)';

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
          {effectiveLocale === 'zh' ? '跳过' : 'Skip'}
        </button>
      </div>
    </div>
  );
}
