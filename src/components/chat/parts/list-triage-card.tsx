'use client';

/**
 * ListTriageCard — 购物清单批量分诊卡 (batch57-a)
 *
 * 用户甩出一张购物清单 ("周末要买这些：A、B、C、D") 命中清单轮时,
 * 小象迎接回复气泡下方渲染本卡: 每条目一行三态分诊 (🟢 绿灯放行 /
 * 🔁 有替代 — 只读引用 green-alt 词条 why+alternative / 🤔 建议再想 —
 * 邀请式一句, 非羞辱) + 每条目三个动作 chip (就买 / 看替代 / 再想想)。
 *   - 绿灯是"这项没风险"的平静陈述, 不是"你可以买"的恩准 (红线)
 *   - 无词条命中的条目绝不出现编造环保声明 (红线)
 *   - exempt 品类条目服务端已静默归绿灯, 卡面不区分来源不啰嗦 (53-b)
 *   - 点选后: layered 回复按守护强度三档取文案 (gentle/balanced/strict),
 *     落账 health_events manual_adjustment + metadata
 *     {source='list_triage', item, verdict, alt_id, action, decision_key}
 *     — triggerId 式日期键约定, 零 DDL
 *   - 卡尾合计纯计数 (N 项中 X 绿灯 / Y 有替代 / Z 建议再想), 零金额零碳数值;
 *     金额永不进分享面
 */

import { useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { useGuardIntensity } from '@/hooks/use-guard-intensity';
import { dateKeyOf } from '@/lib/green-commitment';
import type { ListTriageCardData, ListTriageItem } from '@/types/list-triage';

const LIST_TRIAGE_SOURCE = 'list_triage';

type ItemAction = 'buy' | 'alt' | 'think';

export function ListTriageCard({ data }: { data: ListTriageCardData }) {
  const { t } = useI18n();
  const { guardIntensity } = useGuardIntensity();
  /** 每条目独立选择 (word → 已选动作), 与其他条目互不阻塞 */
  const [choices, setChoices] = useState<Record<string, ItemAction>>({});

  const choose = (item: ListTriageItem, action: ItemAction) => {
    if (choices[item.word]) return; // 防连点重复落账
    setChoices((prev) => ({ ...prev, [item.word]: action }));
    apiFetch('/api/buddy/health-events', {
      method: 'POST',
      body: {
        eventType: 'manual_adjustment',
        triggerSource: 'manual',
        description: `List triage — ${item.word}: ${action}`,
        metadata: {
          source: LIST_TRIAGE_SOURCE,
          category: item.category,
          item: item.word,
          verdict: item.verdict,
          alt_id: item.altId,
          action,
          decision_key: dateKeyOf(new Date()),
        },
      },
    }).catch((err: unknown) => {
      // safe to ignore: 分诊落账失败不弹错不阻塞 (卡面已给出 layered 回复)
      logger.warn('[list-triage-card] action report failed (silently skipped):', err instanceof Error ? err.message : String(err));
    });
  };

  const doneCount = Object.keys(choices).length;

  return (
    <aside
      className="mt-3 rounded-xl border border-glass-border bg-glass-fill backdrop-blur-sm p-3"
      aria-label={t('chat.listTriage.title')}
      data-testid="list-triage-card"
    >
      <h4 className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
        <span aria-hidden>🐘</span>
        <span>{t('chat.listTriage.title')}</span>
      </h4>

      <ul className="mt-2 space-y-1.5" data-testid="list-triage-items">
        {data.items.map((item) => {
          const chosen = choices[item.word];
          return (
            <li key={item.word} className="text-[11px] leading-relaxed text-text-secondary" data-testid="list-triage-item">
              <span className="mr-1" aria-hidden data-testid="list-triage-verdict">
                {item.verdict === 'green' ? '🟢' : item.verdict === 'alt' ? '🔁' : '🤔'}
              </span>
              <span className="text-text-primary">{item.word}</span>
              {' — '}
              <span data-testid="list-triage-item-line">
                {item.verdict === 'green'
                  ? t('chat.listTriage.verdictGreen')
                  : item.verdict === 'alt'
                    ? t('chat.listTriage.verdictAlt', { why: item.why ?? '' })
                    : t('chat.listTriage.verdictThink')}
              </span>
              {item.verdict === 'alt' && item.alternative ? (
                <span className="block pl-5" data-testid="list-triage-alt-detail">
                  {item.alternative}
                </span>
              ) : null}
              {chosen ? (
                <span className="mt-1 block border-t border-glass-border pt-1" data-testid="list-triage-item-reply">
                  🌱 {t(`chat.listTriage.reply.${chosen}.${guardIntensity}`, { item: item.word })}
                </span>
              ) : (
                <span className="mt-1 flex flex-wrap items-center gap-1.5" data-testid="list-triage-chips">
                  <Chip testId="list-triage-buy" label={t('chat.listTriage.buyBtn')} onClick={() => choose(item, 'buy')} />
                  <Chip testId="list-triage-alt" label={t('chat.listTriage.altBtn')} onClick={() => choose(item, 'alt')} />
                  <Chip testId="list-triage-think" label={t('chat.listTriage.thinkBtn')} onClick={() => choose(item, 'think')} muted />
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <p
        className="mt-2 border-t border-glass-border pt-2 text-[11px] leading-relaxed text-text-secondary"
        data-testid="list-triage-summary"
      >
        {t('chat.listTriage.summary', {
          total: String(data.summary.total),
          green: String(data.summary.green),
          alt: String(data.summary.alt),
          think: String(data.summary.think),
        })}
        {doneCount > 0 ? ` ${t('chat.listTriage.privateNote')}` : ''}
      </p>
    </aside>
  );
}

function Chip({ testId, label, onClick, muted }: { testId: string; label: string; onClick: () => void; muted?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border border-glass-border bg-glass-fill px-2 py-0.5 text-[11px] font-medium transition-colors hover:border-emerald-500/30 ${muted ? 'text-text-tertiary' : 'text-text-primary'}`}
      data-testid={testId}
    >
      {label}
    </button>
  );
}
