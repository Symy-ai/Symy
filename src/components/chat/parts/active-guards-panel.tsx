'use client';

/**
 * ActiveGuardsPanel — 进行中守护面板 (batch59-a)
 *
 * chat 内二级视图 (与 guard-moments 卡同形态): 顶部身份线 (守护中 N 件事 · 已坚持
 * D 天) + 三类 active 项列表 (挑战/承诺/冷静期, 各带剩余时间与 SOS 按钮)。
 * 每条 in-app 私享预估守护金额 (🔒, 永不进分享面); 分享面走
 * buildActiveGuardsShareData — 输出类型结构上无金额 (red-line test 锁)。
 * 空态: 引导文案 + 最近一件已胜利时刻 (aggregateGuardMoments 取最新) 作激励。
 * 面板数据全部只读派生, 唯一写入是 SOS 事件 (guard_sos)。
 */

import { useState } from 'react';
import { Hourglass, Share2, Trophy, X } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import type {
  ActiveChallengeGuard,
  ActiveCooldownGuard,
  ActiveCommitmentGuard,
  ActiveGuardsSummary,
} from '@/lib/active-guards';
import type { GuardMoment } from '@/lib/guard-moments';
import { buildActiveGuardsShareData } from '@/lib/active-guards-share';
import { ActiveGuardsSos } from './active-guards-sos';

type SosTarget =
  | { refKind: 'challenge'; refKey: string; hoursLeft: number }
  | { refKind: 'commitment'; refKey: string; hoursLeft: number }
  | { refKind: 'cooldown'; refKey: string; hoursLeft: number };

function formatAmount(n: number, locale: string): string {
  const rounded = Math.round(n);
  return locale === 'zh' ? `¥${rounded}` : `$${rounded}`;
}

function formatDay(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function SosButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="active-guards-sos-btn"
      className="shrink-0 rounded-lg border border-emerald-300/25 bg-emerald-950/40 px-2 py-1 text-[10px] font-medium text-emerald-50/90 transition-colors hover:bg-emerald-900/50"
    >
      {t('chat.activeGuards.sosBtn')}
    </button>
  );
}

function PrivateAmount({ amount, locale }: { amount: number | null; locale: string }) {
  const { t } = useI18n();
  if (amount === null || !(amount > 0)) return null;
  // 预估守护金额 — 仅 App 内私享, 永不进分享/荣誉面
  return (
    <span className="text-[11px] text-text-tertiary" data-testid="active-guards-item-saved">
      🔒 {t('chat.activeGuards.savedPrivate', { amount: formatAmount(amount, locale) })}
    </span>
  );
}

export interface ActiveGuardsPanelProps {
  summary: ActiveGuardsSummary;
  /** 最近一件已胜利时刻 (空态激励用), 无则 null */
  latestWin: GuardMoment | null;
  onClose: () => void;
}

export function ActiveGuardsPanel({ summary, latestWin, onClose }: ActiveGuardsPanelProps) {
  const { t, locale } = useI18n();
  const [sosTarget, setSosTarget] = useState<SosTarget | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const renderChallenge = (item: ActiveChallengeGuard) => (
    <li
      key={item.id}
      className="rounded-xl border border-glass-border bg-glass-fill px-2.5 py-2"
      data-testid="active-guards-challenge"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-primary">{item.itemName}</span>
        <SosButton onClick={() => setSosTarget({ refKind: 'challenge', refKey: item.id, hoursLeft: item.hoursLeft })} />
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-text-tertiary" data-testid="active-guards-challenge-remaining">
          {item.hoursLeft <= 1
            ? t('chat.activeGuards.remaining.dueToday')
            : t('chat.activeGuards.remaining.hoursLeft', { hours: String(Math.ceil(item.hoursLeft)) })}
        </span>
        <PrivateAmount amount={item.guardedAmount} locale={locale} />
      </div>
    </li>
  );

  const renderCommitment = (item: ActiveCommitmentGuard) => (
    <li
      key={item.id}
      className="rounded-xl border border-glass-border bg-glass-fill px-2.5 py-2"
      data-testid="active-guards-commitment"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-primary">
          {item.subject || (item.category !== 'other' ? t(`chat.categoryQuery.category.${item.category}`) : t('chat.activeGuards.itemGeneric'))}
        </span>
        <SosButton onClick={() => setSosTarget({ refKind: 'commitment', refKey: item.id, hoursLeft: item.daysLeft * 24 })} />
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-text-tertiary" data-testid="active-guards-commitment-remaining">
          {item.daysLeft === 0
            ? t('chat.activeGuards.remaining.dueToday')
            : t('chat.activeGuards.remaining.daysLeft', { days: String(item.daysLeft) })}
          <span className="ml-1.5" data-testid="active-guards-commitment-assist">
            · {t('chat.activeGuards.assistLine', { count: String(item.assistCount) })}
          </span>
        </span>
        <PrivateAmount amount={item.assistSaved > 0 ? item.assistSaved : null} locale={locale} />
      </div>
    </li>
  );

  const renderCooldown = (item: ActiveCooldownGuard) => (
    <li
      key={item.id}
      className="rounded-xl border border-glass-border bg-glass-fill px-2.5 py-2"
      data-testid="active-guards-cooldown"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-primary">
          {item.subject || t('chat.prepurchase.itemGeneric')}
        </span>
        <SosButton onClick={() => setSosTarget({ refKind: 'cooldown', refKey: item.id, hoursLeft: item.hoursLeft })} />
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-text-tertiary" data-testid="active-guards-cooldown-remaining">
          {item.dueForRevisit
            ? t('chat.activeGuards.remaining.dueNow')
            : t('chat.activeGuards.remaining.hoursLeft', { hours: String(Math.ceil(item.hoursLeft)) })}
        </span>
        <PrivateAmount amount={item.guardedAmount} locale={locale} />
      </div>
    </li>
  );

  const hasItems = summary.totalCount > 0;
  const share = buildActiveGuardsShareData(summary);

  return (
    <aside
      className="mt-2 mx-3 flex w-[calc(100%-1.5rem)] max-h-[60vh] flex-col rounded-xl border border-glass-border bg-glass-fill p-3 backdrop-blur-sm"
      data-testid={hasItems ? 'active-guards-panel' : 'active-guards-empty'}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-text-primary">{t('chat.activeGuards.title')}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('chat.activeGuards.closeBtn')}
          className="text-text-tertiary transition-colors hover:text-text-primary"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {!hasItems ? (
        <div className="mt-2">
          <p className="text-xs font-medium text-text-secondary">{t('chat.activeGuards.emptyTitle')}</p>
          <p className="mt-1 text-xs leading-relaxed text-text-tertiary">
            🐘 {t('chat.activeGuards.emptyBody')}
          </p>
          {latestWin && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-text-secondary" data-testid="active-guards-latest-win">
              <Trophy className="h-3 w-3 text-emerald-300" aria-hidden="true" />
              {t('chat.activeGuards.latestWinLine', { date: formatDay(latestWin.date, locale) })}
            </p>
          )}
        </div>
      ) : (
        <>
          {/* 身份线 — 纯件数/天数 (面子) */}
          <p className="mt-1 text-[11px] text-text-tertiary" data-testid="active-guards-identity">
            <Hourglass className="mr-1 inline h-3 w-3" aria-hidden="true" />
            {t('chat.activeGuards.identityLine', {
              count: String(summary.totalCount),
              days: String(summary.persistDays),
            })}
          </p>

          <div className="mt-2 min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-0.5" data-testid="active-guards-list">
            {summary.challenges.length > 0 && (
              <section>
                <p className="px-0.5 py-1 text-[11px] font-semibold text-text-secondary">
                  {t('chat.activeGuards.section.challenge')}
                </p>
                <ul className="space-y-1.5">{summary.challenges.map(renderChallenge)}</ul>
              </section>
            )}
            {summary.commitments.length > 0 && (
              <section>
                <p className="px-0.5 py-1 text-[11px] font-semibold text-text-secondary">
                  {t('chat.activeGuards.section.commitment')}
                </p>
                <ul className="space-y-1.5">{summary.commitments.map(renderCommitment)}</ul>
              </section>
            )}
            {summary.cooldowns.length > 0 && (
              <section>
                <p className="px-0.5 py-1 text-[11px] font-semibold text-text-secondary">
                  {t('chat.activeGuards.section.cooldown')}
                </p>
                <ul className="space-y-1.5">{summary.cooldowns.map(renderCooldown)}</ul>
              </section>
            )}
            {sosTarget && (
              <ActiveGuardsSos
                refKind={sosTarget.refKind}
                refKey={sosTarget.refKey}
                hoursLeft={sosTarget.hoursLeft}
                onClose={() => setSosTarget(null)}
              />
            )}
          </div>

          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="flex items-center gap-1 rounded-full border border-emerald-300/25 bg-emerald-950/40 px-2.5 py-1 text-[11px] text-emerald-50/90 transition-colors hover:bg-emerald-900/50"
              data-testid="active-guards-share-btn"
            >
              <Share2 className="h-3 w-3" aria-hidden="true" />
              {t('chat.activeGuards.shareBtn')}
            </button>
          </div>

          {/* 分享弹层 — 面子字段 only (ActiveGuardsShareData 类型上无金额) */}
          {shareOpen && (
            <div
              className="fixed inset-0 z-[320] flex items-center justify-center bg-black/60 p-4"
              role="dialog"
              aria-modal="true"
              onClick={() => setShareOpen(false)}
              data-testid="active-guards-share-modal"
            >
              <div
                className="w-[375px] max-h-full overflow-auto rounded-[28px] p-7"
                style={{ background: 'linear-gradient(165deg, #1c4130 0%, #143527 52%, #0c2017 100%)' }}
                onClick={(e) => e.stopPropagation()}
                data-testid="active-guards-share-face"
              >
                <p className="text-[12px] tracking-wide text-[#88a292]">{t('chat.activeGuards.share.pill')}</p>
                <p className="mt-2 text-[26px] font-black leading-snug tracking-tight text-[#f0faf2]">
                  {t('chat.activeGuards.share.headline', { count: String(share.totalCount) })}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-[#b6cbbe]">
                  {t('chat.activeGuards.share.subline', { days: String(share.persistDays) })}
                </p>
                <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-4">
                  <span className="text-sm font-bold tracking-wide text-white">Symy</span>
                  <span className="text-[11px] text-[#b6cbbe]">{t('share.interceptMedal.brandTagline')}</span>
                </div>
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={() => setShareOpen(false)}
                    className="rounded-lg border border-white/20 px-4 py-1.5 text-[12px] text-[#b6cbbe]"
                  >
                    {t('chat.activeGuards.shareClose')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
