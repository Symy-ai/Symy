'use client';

/**
 * CompareCard — A vs B 对比裁决卡 (batch56-a)
 *
 * 用户二选一求问 ("买 iPad 还是安卓平板") 命中对比轮时, 小象迎接回复气泡下方
 * 渲染本卡: 三行裁决 (需求紧迫度 / 绿色替代 / 耐用二手) + 两个动作 chip
 * (选 A / 选 B) + 再想想 (复用既有 24h 冷静 pending 通路)。
 *   - 绿色替代行只引用 green-alt 词条命中侧的 why (词条表只读, 不改);
 *     无据侧走中性引导, 绝不编造环保声明 (红线)
 *   - 点选后: layered 回复按守护强度三档取文案 (gentle/balanced/strict),
 *     选择落账 health_events manual_adjustment + metadata
 *     {source='compare_decision', sideA, sideB, chosen, entry_a/entry_b,
 *      decision_key} — triggerId 式日期键约定, 零 DDL
 *
 * 红线: 非羞辱 (两侧都可选, 小象不评判选贵的一侧); 卡内无私享金额换算内容;
 * 无碳数值; 用户主动求问, 不受绿色守护开关静默。
 */

import { useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { useGuardIntensity } from '@/hooks/use-guard-intensity';
import { dateKeyOf } from '@/lib/green-commitment';
import { resolveGuardCategory } from '@/lib/guard-category-insight';
import { savePendingCooldown } from './cooldown-store';
import type { CompareCardData, CompareSideMatch } from '@/types/compare';

const COMPARE_DECISION_SOURCE = 'compare_decision';

/** guard 品类 → 冷静卡品类 (窄联合): electronics/clothing/beauty/food 之外归 home */
function toCooldownCategory(cat: string): 'electronics' | 'clothing' | 'beauty' | 'food' | 'home' {
  return cat === 'electronics' || cat === 'clothing' || cat === 'beauty' || cat === 'food' ? cat : 'home';
}

type Choice = 'a' | 'b' | 'think';

export function CompareCard({ data }: { data: CompareCardData }) {
  const { t } = useI18n();
  const { guardIntensity } = useGuardIntensity();
  const [choice, setChoice] = useState<Choice | null>(null);

  const choose = (next: Choice) => {
    if (choice) return; // 防连点重复落账
    setChoice(next);
    if (next === 'think') {
      // 再想想 → 复用既有 24h 冷静 pending 通路 (明天 followup 问一次)
      savePendingCooldown({
        category: toCooldownCategory(resolveGuardCategory({ itemTitle: `${data.sideA} ${data.sideB}` })),
        askedAt: Date.now(),
        dueAt: Date.now() + 24 * 60 * 60 * 1000,
        userChoseBuy: false,
      });
    }
    apiFetch('/api/buddy/health-events', {
      method: 'POST',
      body: {
        eventType: 'manual_adjustment',
        triggerSource: 'manual',
        description: `Compare decision — ${data.sideA} vs ${data.sideB}: chose ${next === 'a' ? data.sideA : next === 'b' ? data.sideB : 'think-it-over'}`,
        metadata: {
          source: COMPARE_DECISION_SOURCE,
          category: resolveGuardCategory({ itemTitle: next === 'a' ? data.sideA : next === 'b' ? data.sideB : `${data.sideA} ${data.sideB}` }),
          side_a: data.sideA,
          side_b: data.sideB,
          chosen: next,
          entry_a: data.matchA?.id ?? null,
          entry_b: data.matchB?.id ?? null,
          decision_key: dateKeyOf(new Date()),
        },
      },
    }).catch((err: unknown) => {
      // safe to ignore: 决策落账失败不弹错不阻塞 (卡面已给出 layered 回复)
      logger.warn('[compare-card] decision report failed (silently skipped):', err instanceof Error ? err.message : String(err));
    });
  };

  const replyLine = choice
    ? t(`chat.compare.reply.${choice}.${guardIntensity}`, {
        side: choice === 'a' ? data.sideA : choice === 'b' ? data.sideB : '',
      })
    : null;

  return (
    <aside
      className="mt-3 rounded-xl border border-glass-border bg-glass-fill backdrop-blur-sm p-3"
      aria-label={t('chat.compare.title')}
      data-testid="compare-card"
    >
      <h4 className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
        <span aria-hidden>🐘</span>
        <span>{t('chat.compare.title')}</span>
        <span className="text-text-secondary">
          {data.sideA} · {data.sideB}
        </span>
      </h4>

      <ul className="mt-2 space-y-1.5" data-testid="compare-verdicts">
        <li className="text-[11px] leading-relaxed text-text-secondary">
          <span className="text-text-primary">{t('chat.compare.lineNeedLabel')}</span>
          {t('chat.compare.lineNeed')}
        </li>
        <li className="text-[11px] leading-relaxed text-text-secondary" data-testid="compare-alt-line">
          <span className="text-text-primary">{t('chat.compare.lineAltLabel')}</span>
          {data.matchA || data.matchB ? (
            <span className="block">
              {data.matchA ? <SideMatchRow label={data.sideA} match={data.matchA} /> : null}
              {data.matchB ? <SideMatchRow label={data.sideB} match={data.matchB} /> : null}
            </span>
          ) : (
            t('chat.compare.lineAltNone')
          )}
        </li>
        <li className="text-[11px] leading-relaxed text-text-secondary">
          <span className="text-text-primary">{t('chat.compare.lineDurabilityLabel')}</span>
          {data.matchA || data.matchB ? t('chat.compare.lineDurabilityCited') : t('chat.compare.lineDurabilityNeutral')}
        </li>
      </ul>

      {choice ? (
        <p className="mt-2 border-t border-glass-border pt-2 text-[11px] leading-relaxed text-text-secondary" data-testid="compare-chosen-reply">
          🌱 {replyLine}
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="compare-chips">
          <button
            type="button"
            onClick={() => choose('a')}
            className="rounded-lg border border-glass-border bg-glass-fill px-2.5 py-1 text-[11px] font-medium text-text-primary transition-colors hover:border-emerald-500/30"
            data-testid="compare-choose-a"
          >
            {t('chat.compare.chooseA', { side: data.sideA })}
          </button>
          <button
            type="button"
            onClick={() => choose('b')}
            className="rounded-lg border border-glass-border bg-glass-fill px-2.5 py-1 text-[11px] font-medium text-text-primary transition-colors hover:border-emerald-500/30"
            data-testid="compare-choose-b"
          >
            {t('chat.compare.chooseB', { side: data.sideB })}
          </button>
          <button
            type="button"
            onClick={() => choose('think')}
            className="rounded-lg border border-glass-border bg-glass-fill px-2.5 py-1 text-[11px] font-medium text-text-tertiary transition-colors hover:border-emerald-500/30"
            data-testid="compare-choose-think"
          >
            {t('chat.compare.thinkBtn')}
          </button>
        </div>
      )}
    </aside>
  );
}

/** 命中侧的词条引用行 — 只读引用词条 why, 不改词条不编造 */
function SideMatchRow({ label, match }: { label: string; match: CompareSideMatch }) {
  return (
    <span className="block" data-testid={`compare-alt-match`}>
      · {label}: {match.why}
    </span>
  );
}
