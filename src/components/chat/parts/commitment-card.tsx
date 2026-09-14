'use client';

/**
 * CommitmentCard — 绿色承诺登记卡 (batch53-a)
 *
 * 用户口头承诺 ("这个月不买咖啡") 命中承诺轮时, 小象迎接回复气泡下方渲染本卡:
 *   - 确认承诺内容: 对象原词 (识别不出走通用文案) + 时长 chips
 *     (到本月底默认 / 7 / 14 / 30 天, 检测出的时长预选)
 *   - 点确认即登记: 写 health_events manual_adjustment + metadata
 *     {source='green_commitment', category, subject, start_key, end_key} — 零 DDL,
 *     对齐 triggerId 式日期键约定 (weekly-review/post-purchase-review 同通道)
 *   - 品类由承诺对象原词派生 (resolveGuardCategory 同词表), 到期结算时用于
 *     「守护助攻」匹配 (该品类被成功拦截的挑战)
 *
 * 红线: 非羞辱框架 (登记是"小象陪你守", 不是军令状); 金额与本卡无关;
 * 用户主动承诺, 不受绿色守护开关静默 (入口是用户自己的话)。
 */

import { useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { commitmentEndKeyOf, dateKeyOf, GREEN_COMMITMENT_SOURCE } from '@/lib/green-commitment';
import { resolveGuardCategory } from '@/lib/guard-category-insight';
import type { CommitmentCardData } from '@/types/commitment';

type DurationChoice = { kind: 'month_end'; days: null } | { kind: 'fixed'; days: number };

const FIXED_OPTIONS: number[] = [7, 14, 30];

function initialChoice(data: CommitmentCardData): DurationChoice {
  return data.durationKind === 'fixed' && data.days ? { kind: 'fixed', days: data.days } : { kind: 'month_end', days: null };
}

export function CommitmentCard({ data }: { data: CommitmentCardData }) {
  const { t } = useI18n();
  const [choice, setChoice] = useState<DurationChoice>(initialChoice(data));
  const [confirmed, setConfirmed] = useState(false);

  const confirm = () => {
    if (confirmed) return; // 防连点重复写登记
    setConfirmed(true);
    const now = new Date();
    const startKey = dateKeyOf(now);
    const endKey = commitmentEndKeyOf(now, choice.kind, choice.days);
    const subject = data.subject;
    apiFetch('/api/buddy/health-events', {
      method: 'POST',
      body: {
        eventType: 'manual_adjustment',
        triggerSource: 'manual',
        description: `Green commitment registered — no buying ${subject || '(unspecified)'} until ${endKey}`,
        metadata: {
          source: GREEN_COMMITMENT_SOURCE,
          category: resolveGuardCategory({ itemTitle: subject }),
          subject,
          start_key: startKey,
          end_key: endKey,
        },
      },
    }).catch((err: unknown) => {
      // safe to ignore: 登记上报失败不弹错不阻塞 (卡面已确认, 到期派生以事件为准)
      logger.warn('[commitment-card] register report failed (silently skipped):', err instanceof Error ? err.message : String(err));
    });
  };

  const subjectSuffix = data.subject ? ` · ${data.subject}` : '';

  return (
    <aside
      className="mt-3 rounded-xl border border-glass-border bg-glass-fill backdrop-blur-sm p-3"
      aria-label={t('chat.commitment.title')}
      data-testid="commitment-card"
    >
      <h4 className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
        <span aria-hidden>🐘</span>
        <span>{t('chat.commitment.title')}{subjectSuffix}</span>
      </h4>

      {confirmed ? (
        <div className="mt-2 border-t border-glass-border pt-2" data-testid="commitment-confirmed">
          <p className="text-[11px] leading-relaxed text-text-secondary">
            🌱 {t('chat.commitment.confirmedBody', {
              subject: data.subject || t('chat.commitment.subjectFallback'),
              date: endKeyLabel(choice),
            })}
          </p>
          <p className="mt-1.5 text-[11px] text-text-tertiary" data-testid="commitment-guard-note">
            {t('chat.commitment.guardNote')}
          </p>
        </div>
      ) : (
        <div className="mt-2">
          <p className="text-xs leading-relaxed text-text-secondary">
            {t('chat.commitment.confirmBody', { subject: data.subject || t('chat.commitment.subjectFallback') })}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="commitment-duration-chips">
            <button
              type="button"
              onClick={() => setChoice({ kind: 'month_end', days: null })}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                choice.kind === 'month_end'
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-text-primary'
                  : 'border-glass-border bg-glass-fill text-text-primary hover:border-emerald-500/30'
              }`}
              data-testid="commitment-duration-month"
            >
              {t('chat.commitment.durationMonthEnd')}
            </button>
            {FIXED_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setChoice({ kind: 'fixed', days: d })}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  choice.kind === 'fixed' && choice.days === d
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-text-primary'
                    : 'border-glass-border bg-glass-fill text-text-primary hover:border-emerald-500/30'
                }`}
                data-testid={`commitment-duration-${d}`}
              >
                {t('chat.commitment.durationDays', { n: String(d) })}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-text-tertiary" data-testid="commitment-until-hint">
              {t('chat.commitment.untilHint', { date: endKeyLabel(choice) })}
            </span>
            <button
              type="button"
              onClick={confirm}
              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white"
              data-testid="commitment-confirm"
            >
              {t('chat.commitment.confirmBtn')}
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

/** 时长选择 → 到期日本地展示 (YYYY-MM-DD, 与写入的 end_key 同口径) */
function endKeyLabel(choice: DurationChoice): string {
  return commitmentEndKeyOf(new Date(), choice.kind, choice.days);
}
