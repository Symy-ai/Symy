'use client';

/**
 * DreamFundEmptyGuide — T-2 Dream Funds 首次使用引导
 *
 * 当用户 Dream Funds 为空时展示：
 * - 推荐目标 chips
 * - 底部 Add a fund 按钮
 * 点击 chip 后打开 DreamFundEditor 并预填建议值。
 */

import { useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { DreamFundEditor } from '@/components/buddy/dream-fund-editor';
import type { DreamFund } from '@/types/buddy-state';

interface DreamFundEmptyGuideProps {
  isDemo: boolean;
  dreamFunds: DreamFund[] | undefined;
  onCreateDreamFund?: (fund: Omit<DreamFund, 'id'>) => void;
  onToast?: (message: string, type?: 'success' | 'info') => void;
}

const SUGGESTIONS = [
  { emoji: '🏠', name: 'House down payment ($50,000)', target: 50000 },
  { emoji: '🚨', name: 'Emergency fund ($10,000)', target: 10000 },
  { emoji: '✈️', name: 'Dream vacation ($5,000)', target: 5000 },
  { emoji: '💻', name: 'New laptop ($2,000)', target: 2000 },
];

export function DreamFundEmptyGuide({
  isDemo,
  dreamFunds,
  onCreateDreamFund,
  onToast,
}: DreamFundEmptyGuideProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [initialValues, setInitialValues] = useState<{ name: string; target: number; emoji: string } | null>(null);

  if (isDemo || (dreamFunds && dreamFunds.length > 0)) return null;

  return (
    <div className="px-4 py-8 text-center">
      <p className="text-4xl mb-3">🎯</p>
      <h3 className="text-base font-bold text-text-primary mb-1">{t('buddy.dreamFundsEmpty', { defaultValue: 'Add your first dream' })}</h3>
      <p className="text-xs text-text-tertiary mb-4">{t('buddy.dreamFundsEmptyDesc', { defaultValue: "Money you don't spend grows toward goals." })}</p>
      <div className="flex flex-wrap justify-center gap-2 mb-4">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion.name}
            onClick={() => {
              setInitialValues({ name: suggestion.name, target: suggestion.target, emoji: suggestion.emoji });
              setOpen(true);
            }}
            className="text-[11px] px-3 py-1.5 rounded-full bg-glass-fill border border-glass-border text-text-secondary hover:border-cyan-500/50 hover:text-cyan-400 transition-colors"
          >
            {suggestion.emoji} {suggestion.name}
          </button>
        ))}
      </div>
      <button
        onClick={() => {
          setInitialValues(null);
          setOpen(true);
        }}
        className="px-4 py-2 rounded-xl bg-cyan-500/20 text-cyan-400 text-sm font-medium hover:bg-cyan-500/30 transition-colors"
      >
        {t('buddy.dreamFundAdd', { defaultValue: 'Add a fund →' })}
      </button>

      <DreamFundEditor
        open={open}
        editingFund={null}
        mode="create"
        existingFunds={dreamFunds || []}
        onClose={() => setOpen(false)}
        onCreate={(fund) => {
          onCreateDreamFund?.({ name: fund.name, target: fund.target, current: 0, emoji: fund.emoji });
          setOpen(false);
        }}
        onUpdate={() => {}}
        onToast={onToast}
        initialValues={initialValues}
      />
    </div>
  );
}
