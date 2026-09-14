'use client';

/**
 * CommitmentSettlement — 绿色承诺到期结算卡 (batch53-a)
 *
 * 到期当天 chat 首轮对话自动开场 (use-green-commitment 一次性派生锁, 零新 cron)。
 * 三分支:
 *   - kept: 庆祝 + 承诺时长 (天) + 守护助攻次数 + 可分享勋章面 (深绿, 只有天数/
 *     次数, 结构上不含金额); 私有区另展示承诺期内换回的自由小时 (shared hourly rate)
 *   - broken: 非羞辱话术 ("守护还在, 我们看看下次"), 一键重启新承诺
 *   - insufficient: 窗口内无守护数据 — 温和说明 + 同样可重启
 *
 * 红线: 破戒分支禁"失败/失信"类措辞 (elephant-tone 非羞辱约定); 金额永不出现。
 */

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import {
  commitmentEndKeyOf,
  dateKeyOf,
  GREEN_COMMITMENT_SOURCE,
} from '@/lib/green-commitment';
import { resolveGuardCategory } from '@/lib/guard-category-insight';
import { formatDiaryHours } from '@/lib/guard-diary';
import type { GreenCommitmentSettlement } from '@/types/green-commitment';
import { CommitmentShareFace } from '@/components/chat-parts/commitment-share';

export interface CommitmentSettlementProps {
  settlement: GreenCommitmentSettlement;
  onSettled: (refKey: string, outcome: GreenCommitmentSettlement['outcome']) => void;
  onClose: () => void;
}

/** 破戒/数据不足后的一键重启: 按原时长重新登记一条新承诺 (同通道零 DDL) */
function restartCommitment(settlement: GreenCommitmentSettlement): void {
  const now = new Date();
  const startKey = dateKeyOf(now);
  const days = settlement.days > 0 ? settlement.days : 7;
  const endKey = commitmentEndKeyOf(now, 'fixed', days);
  const subject = settlement.record.subject;
  apiFetch('/api/buddy/health-events', {
    method: 'POST',
    body: {
      eventType: 'manual_adjustment',
      triggerSource: 'manual',
      description: `Green commitment restarted — no buying ${subject || '(unspecified)'} until ${endKey}`,
      metadata: {
        source: GREEN_COMMITMENT_SOURCE,
        category: resolveGuardCategory({ category: settlement.record.category, itemTitle: subject }),
        subject,
        start_key: startKey,
        end_key: endKey,
      },
    },
  }).catch((err: unknown) => {
    // safe to ignore: 重启登记失败静默 (用户可再说一次承诺语重新触发)
    logger.warn('[commitment-settlement] restart report failed (silently skipped):', err instanceof Error ? err.message : String(err));
  });
}

export function CommitmentSettlement({ settlement, onSettled, onClose }: CommitmentSettlementProps) {
  const { t } = useI18n();
  const [restarted, setRestarted] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const subject = settlement.record.subject || t('chat.commitment.subjectFallback');
  const daysLabel = String(settlement.days);
  const assistsLabel = String(settlement.assistCount);

  const closeCard = () => {
    setShareOpen(false);
    onClose();
  };

  const settle = (outcome: GreenCommitmentSettlement['outcome']) => {
    onSettled(settlement.refKey, outcome);
  };

  const restart = () => {
    if (restarted) return;
    setRestarted(true);
    restartCommitment(settlement);
  };

  return (
    <div data-testid="commitment-settlement-card" className="mt-2 mx-3 p-3 rounded-xl border border-glass-border bg-glass-fill backdrop-blur-sm">
      <p className="text-[11px] font-semibold text-text-primary" data-testid="commitment-settlement-title">
        🐘 {t('chat.commitment.settlement.title')}
      </p>

      {settlement.outcome === 'kept' ? (
        <div data-testid="commitment-settlement-kept">
          <p className="mt-1.5 text-[11px] leading-relaxed text-text-primary">
            🌱 {t('chat.commitment.settlement.keptBody', { subject, days: daysLabel })}
          </p>
          <div className="mt-2 flex items-center gap-2" data-testid="commitment-settlement-stats">
            <span className="rounded-lg border border-glass-border px-2 py-1 text-[11px] text-text-primary">
              {t('chat.commitment.settlement.statDays', { days: daysLabel })}
            </span>
            <span className="rounded-lg border border-glass-border px-2 py-1 text-[11px] text-text-primary">
              {t('chat.commitment.settlement.statAssists', { count: assistsLabel })}
            </span>
          </div>
          {/* 私有区: 换回的自由小时 (走 shared hourly rate; 永不进分享面) */}
          {settlement.hoursReclaimed > 0 && (
            <p className="mt-1.5 text-[11px] text-text-tertiary" data-testid="commitment-settlement-hours">
              {t('chat.commitment.settlement.hoursPrivate', { hours: formatDiaryHours(settlement.hoursReclaimed) })}
            </p>
          )}
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              onClick={() => setShareOpen(true)}
              className="flex items-center gap-1 rounded-lg border border-glass-border px-2.5 py-1 text-[11px] font-medium text-text-primary transition-colors hover:border-emerald-500/30"
              data-testid="commitment-settlement-share-btn"
            >
              <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t('chat.commitment.shareBtn')}
            </button>
            <button
              onClick={() => settle('kept')}
              className="rounded-lg border border-glass-border px-2.5 py-1 text-[11px] text-text-secondary"
              data-testid="commitment-settlement-close"
            >
              {t('chat.commitment.closeBtn')}
            </button>
          </div>
        </div>
      ) : settlement.outcome === 'broken' ? (
        <div data-testid="commitment-settlement-broken">
          <p className="mt-1.5 text-[11px] leading-relaxed text-text-primary">
            🐘 {t('chat.commitment.settlement.brokenBody', { subject })}
          </p>
          <p className="mt-1 text-[11px] text-text-tertiary" data-testid="commitment-settlement-broken-note">
            {t('chat.commitment.settlement.brokenNote')}
          </p>
          {restarted ? (
            <p className="mt-2 text-[11px] text-text-secondary" data-testid="commitment-restart-ack">
              🌱 {t('chat.commitment.settlement.restartAck', { days: daysLabel })}
            </p>
          ) : (
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                onClick={restart}
                className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white"
                data-testid="commitment-restart-btn"
              >
                {t('chat.commitment.settlement.restartBtn', { days: daysLabel })}
              </button>
              <button
                onClick={() => settle('broken')}
                className="rounded-lg border border-glass-border px-2.5 py-1 text-[11px] text-text-secondary"
                data-testid="commitment-settlement-close"
              >
                {t('chat.commitment.closeBtn')}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div data-testid="commitment-settlement-insufficient">
          <p className="mt-1.5 text-[11px] leading-relaxed text-text-secondary">
            🐘 {t('chat.commitment.settlement.insufficientBody', { subject, days: daysLabel })}
          </p>
          {restarted ? (
            <p className="mt-2 text-[11px] text-text-secondary" data-testid="commitment-restart-ack">
              🌱 {t('chat.commitment.settlement.restartAck', { days: daysLabel })}
            </p>
          ) : (
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                onClick={restart}
                className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white"
                data-testid="commitment-restart-btn"
              >
                {t('chat.commitment.settlement.restartBtn', { days: daysLabel })}
              </button>
              <button
                onClick={() => settle('insufficient')}
                className="rounded-lg border border-glass-border px-2.5 py-1 text-[11px] text-text-secondary"
                data-testid="commitment-settlement-close"
              >
                {t('chat.commitment.closeBtn')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 分享弹层 — 面子字段 only (shareData 类型上无金额) */}
      {shareOpen && (
        <div
          className="fixed inset-0 z-[320] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={closeCard}
          data-testid="commitment-share-modal"
        >
          <div className="max-h-full overflow-auto" onClick={(e) => e.stopPropagation()}>
            <CommitmentShareFace
              data={{
                days: settlement.days,
                assistCount: settlement.assistCount,
              }}
            />
            <div className="mt-3 flex items-center justify-center gap-3">
              <button
                onClick={closeCard}
                className="rounded-lg border border-glass-border px-4 py-1.5 text-[12px] text-text-secondary"
              >
                {t('chat.commitment.shareClose')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
