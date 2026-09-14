'use client';

/**
 * GreenKnowledgeChip — 绿色知识问答来源 chip (batch47-a)
 *
 * 用户在 chat 里问绿色知识 ("refurb 值得买吗") 且服务端预检命中词条时,
 * ChatBubble 在 AI 回复气泡下方渲染: 每个命中词条一个小 chip ("📖 词条：翻新机"),
 * 点击展开该词条的替代选项 + 复用渠道 — 知识问答的终点是省钱替代。
 * 绿色守护开关关闭时整体静默 (与 GreenAltCard 同一开关)。零金额, 无跳转。
 */

import { useState } from 'react';
import { BookOpen, ChevronDown, Leaf, Recycle } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
// 🌱 绿色守护开关: 关闭时 chip 整体静默 (与 GreenAltCard 同一开关)
import { useGreenPref } from '@/hooks/use-green-pref';
import type { GreenKnowledgeCardData, GreenKnowledgeEntryData } from '@/types/green-knowledge';

function KnowledgeEntryPanel({ entry }: { entry: GreenKnowledgeEntryData }) {
  const { t } = useI18n();
  return (
    <div className="mt-2 space-y-2" data-testid="green-knowledge-panel">
      {/* 为什么环境影响高 — 一句陈述, 不说教, 无碳数值 */}
      <p className="text-xs leading-relaxed text-text-secondary">{entry.why}</p>

      {/* 绿色替代选项 */}
      <div>
        <p className="text-[11px] font-medium text-text-secondary">
          {t('chat.greenKnowledge.optionsTitle')}
        </p>
        <ul className="mt-1 space-y-1">
          {entry.options.map((option) => (
            <li key={option} className="flex items-start gap-1.5 text-xs leading-relaxed text-text-primary">
              <Leaf className="mt-0.5 h-3 w-3 flex-shrink-0 text-emerald-500" aria-hidden />
              <span>{option}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 二手/租赁渠道 */}
      <div>
        <p className="text-[11px] font-medium text-text-secondary">
          {t('chat.greenKnowledge.channelTitle')}
        </p>
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-text-secondary">
          <Recycle className="mt-0.5 h-3 w-3 flex-shrink-0 text-emerald-500" aria-hidden />
          <span>{entry.reuseChannel}</span>
        </p>
      </div>
    </div>
  );
}

export function GreenKnowledgeChip({ data }: { data: GreenKnowledgeCardData }) {
  const { t } = useI18n();
  const { greenPrefEnabled } = useGreenPref();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!greenPrefEnabled) return null;

  return (
    <aside
      className="mt-2 space-y-1.5"
      aria-label={t('chat.greenKnowledge.title')}
      data-testid="green-knowledge-chip"
    >
      {data.entries.map((entry) => {
        const expanded = expandedId === entry.id;
        return (
          <div key={entry.id} className="rounded-xl border border-emerald-500/20 bg-glass-fill backdrop-blur-sm p-2.5">
            <button
              type="button"
              onClick={() => setExpandedId(expanded ? null : entry.id)}
              aria-expanded={expanded}
              className="flex w-full items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 transition-colors hover:text-emerald-500"
              data-testid="green-knowledge-chip-toggle"
            >
              <BookOpen className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
              <span className="flex-1 text-left">{t('chat.greenKnowledge.chipLabel', { label: entry.label })}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
            {expanded ? <KnowledgeEntryPanel entry={entry} /> : null}
          </div>
        );
      })}
    </aside>
  );
}
