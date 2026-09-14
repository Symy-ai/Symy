'use client';

/**
 * ContextSignalChips — 弱信号词纠正 chips (batch61-b)
 *
 * 小象从生活语言里识别到的消费场景信号词 ("奖励自己 / 最后三单 / 快坏了"),
 * 在路由卡上方一行小 chips 展示 — 让用户看见小象是怎么理解自己的, 并可逐个
 * 纠正 ("不是因为这个"): 纠正即写 sessionStorage (会话级), 本会话服务端不再
 * 重复同信号。全部纠正后显示一句收到的话, 不再占位。
 *
 * 文案红线: 陪伴句式 ("小象听到的信号"), 不用 "检测到你的冲动" 式审判句式;
 * 展示词来自服务端词表 SSOT (zh/en 双语), 零金额零碳数值。
 */

import { useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { dismissContextSignal, readDismissedContextSignals } from './context-signal-store';
import type { ContextSignalData } from '@/types/context-signal';

export function ContextSignalChips({ data }: { data: ContextSignalData }) {
  const { t, locale } = useI18n();
  // 会话内已纠正词条 (mount 时读一次 storage, 之后本地维护 — 避免每 chip 读写)
  const [dismissed, setDismissed] = useState<string[]>(() => readDismissedContextSignals());
  const active = data.words.filter((word) => !dismissed.includes(word.id));
  const [allCorrected, setAllCorrected] = useState(false);

  if (active.length === 0) {
    return allCorrected ? (
      <p
        className="mt-2 text-[11px] leading-relaxed text-text-tertiary"
        data-testid="context-signal-corrected"
      >
        🐘 {t('chat.contextSignal.corrected')}
      </p>
    ) : null;
  }

  const onDismiss = (id: string) => {
    dismissContextSignal(id);
    setDismissed((prev) => (prev.includes(id) ? prev : [...prev, id]));
    if (active.length <= 1) setAllCorrected(true);
  };

  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-1.5"
      data-testid="context-signal-chips"
    >
      <span className="text-[11px] text-text-tertiary">{t('chat.contextSignal.prefix')}</span>
      {active.map((word) => (
        <span
          key={word.id}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-300"
        >
          {locale === 'en' ? word.en : word.zh}
          <button
            type="button"
            onClick={() => onDismiss(word.id)}
            aria-label={t('chat.contextSignal.dismiss')}
            className="rounded text-emerald-600/70 hover:text-emerald-700 dark:text-emerald-300/70 dark:hover:text-emerald-300 transition-colors"
            data-testid={`context-signal-dismiss-${word.id}`}
          >
            ✕
          </button>
        </span>
      ))}
    </div>
  );
}
