'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@/i18n/provider';
import { apiFetch } from '@/lib/api-client';

interface Reflection {
  id: string;
  avatar: string;
  text: string;
  resonates: number;
  is_seed?: boolean;
  created_at?: string;
}

interface DailyReflectionProps {
  isDemo?: boolean;
  onAuthPrompt?: (feature: string) => void;
}

const SEED_EN = [
  { id: 'seed-1', avatar: '🦋', text: 'I realized I was buying things to feel in control. Now I journal instead.', resonates: 42, is_seed: true },
  { id: 'seed-2', avatar: '🌊', text: 'A $200 jacket I already forgot I wanted. Glad I waited.', resonates: 28, is_seed: true },
  { id: 'seed-3', avatar: '🍃', text: 'The quiet after not buying was louder than the dopamine of buying.', resonates: 35, is_seed: true },
];

const SEED_ZH: Reflection[] = [
  { id: 'seed-1', avatar: '🦋', text: '我意识到自己买东西是为了找回掌控感。现在我改写日记了。', resonates: 42, is_seed: true },
  { id: 'seed-2', avatar: '🌊', text: '一件 200 美元的夹克，差点忘了自己曾想要它。幸好等了等。', resonates: 28, is_seed: true },
  { id: 'seed-3', avatar: '🍃', text: '不买之后的平静，比买了的兴奋更响亮。', resonates: 35, is_seed: true },
];

const getSeedReflections = (locale: string): Reflection[] =>
  locale === 'zh' ? SEED_ZH : SEED_EN;


export function DailyReflection({ isDemo, onAuthPrompt }: DailyReflectionProps) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const dayIndex = new Date().getDay();
  const promptKey = `inward.dailyReflectionPrompt${dayIndex === 0 ? 7 : dayIndex}`;

  const reflectionsQuery = useQuery({
    queryKey: ['reflections', locale],
    queryFn: async () => {
      const data = await apiFetch<{ reflections: Reflection[] }>(`/api/reflections?locale=${locale}`);
      return data.reflections || [];
    },
    enabled: !isDemo,
    staleTime: 30_000,
    retry: 1,
  });

  const items = isDemo ? getSeedReflections(locale) : reflectionsQuery.data;

  const submitMutation = useMutation({
    mutationFn: async (text: string) => {
      const created = await apiFetch<{ reflection: Reflection }>('/api/reflections', {
        method: 'POST',
        body: { text, avatar: '🌙' },
      });
      return created.reflection;
    },
    onSuccess: () => {
      setInput('');
      setSubmitError(null);
      queryClient.invalidateQueries({ queryKey: ['reflections', locale] });
    },
    onError: () => {
      setSubmitError(t('inward.dailyReflectionSubmitError', { defaultValue: 'Couldn’t share — try again.' }));
    },
  });

  const [hasVotedMap, setHasVotedMap] = useState<Record<string, boolean>>({});

  const resonateMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await apiFetch<{ ok: boolean; created: boolean }>('/api/reflections/resonate', {
        method: 'POST',
        body: { id },
      });
      return result;
    },
    onMutate: async (id) => {
      if (hasVotedMap[id]) return { previous: null };
      await queryClient.cancelQueries({ queryKey: ['reflections', locale] });
      const previous = queryClient.getQueryData<Reflection[]>(['reflections', locale]);
      if (previous) {
        queryClient.setQueryData<Reflection[]>(['reflections', locale], previous.map(r => r.id === id ? { ...r, resonates: r.resonates + 1 } : r));
      }
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['reflections', locale], ctx.previous);
        console.warn('[Reflection] resonate rollback');
      }
    },
    onSettled: (_data, _err, id) => {
      queryClient.invalidateQueries({ queryKey: ['reflections', locale] });
      if (id && _data?.created === false) {
        setHasVotedMap(prev => ({ ...prev, [id]: true }));
      }
    },
  });

  useEffect(() => {
    if (!submitError) return;
    const timer = setTimeout(() => setSubmitError(null), 5000);
    return () => clearTimeout(timer);
  }, [submitError]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    if (isDemo) {
      setInput('');
      onAuthPrompt?.('defense');
      return;
    }

    submitMutation.mutate(trimmed);
  };

  const handleResonate = (id: string) => {
    if (isDemo) return;
    resonateMutation.mutate(id);
  };

  const showEmpty = !isDemo && !reflectionsQuery.isLoading && (!items || items.length === 0);

  return (
    <div className="px-4 mt-6">
      <h3 className="text-sm font-bold text-text-primary mb-1">
        {t('inward.dailyReflectionTitle', { defaultValue: "Today's Reflection" })}
      </h3>
      <p className="text-[10px] text-text-tertiary mb-3">
        {t('inward.dailyReflectionSubtitle', { defaultValue: 'Just observe. No judgment.' })}
      </p>

      <div className="rounded-2xl bg-gradient-to-br from-purple-500/10 to-cyan-500/10 border border-purple-500/20 p-4 mb-4">
        <p className="text-sm text-text-primary font-medium leading-relaxed">
          {t(promptKey, { defaultValue: 'Take a moment to reflect.' })}
        </p>
      </div>

      <div className="rounded-xl bg-glass-fill/30 border border-glass-border p-3 mb-4">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('inward.dailyReflectionPlaceholder', { defaultValue: 'Share your reflection...' })}
          maxLength={500}
          rows={2}
          className="w-full bg-transparent text-xs text-text-primary placeholder:text-text-tertiary resize-none outline-none"
        />
        <div className="flex justify-between items-center mt-2">
          <span className="text-[10px] text-text-tertiary">
            {isDemo ? t('inward.dailyReflectionAuthPrompt', { defaultValue: 'Sign up to share your reflection' }) : ''}
          </span>
          <button
            onClick={handleSubmit}
            disabled={!isDemo && !input.trim()}
            className="px-3 py-1 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 text-white text-xs font-medium disabled:opacity-30 transition-opacity"
          >
            {t('inward.dailyReflectionSubmit', { defaultValue: 'Share' })}
          </button>
        </div>
        {submitError && (
          <p className="text-[10px] text-red-400 mt-2">{submitError}</p>
        )}
      </div>

      {showEmpty && (
        <p className="text-[10px] text-text-tertiary mb-2">
          {t('inward.dailyReflectionEmpty', { defaultValue: 'No reflections yet. Yours could be the first.' })}
        </p>
      )}

      <div className="space-y-2">
        {(items || []).map(r => (
          <div
            key={r.id}
            className="rounded-xl bg-glass-fill/40 border border-glass-border/50 p-3 animate-slide-up"
          >
            <div className="flex items-start gap-2">
              <span className="text-base flex-shrink-0">{r.avatar}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-text-secondary leading-relaxed">{r.text}</p>
                <button
                  onClick={() => handleResonate(r.id)}
                  className="flex items-center gap-1 mt-1.5 text-[10px] text-text-tertiary hover:text-purple-400 transition-colors"
                >
                  <span>💜</span>
                  <span>{r.resonates}</span>
                  <span>{t('inward.dailyReflectionReactions', { defaultValue: 'Resonates' })}</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
