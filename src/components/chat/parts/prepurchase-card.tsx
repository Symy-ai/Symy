'use client';

/**
 * PrepurchaseCard — 买前三问决策卡 (用户主动求问流, batch50-a)
 *
 * 用户发「该买 X 吗」类消息时, 小象迎接回复气泡下方渲染本卡:
 *   - 三个问题逐条展示 (真需要吗 / 家里有替代吗 / 愿意等多久), 每答一条
 *     小象给一句简短回应 (语气按守护强度三档, 48-a)
 *   - 答完进入决策区: 价格选填 + 三个选项 (买吧 / 家里有替代 / 冷静 24h)
 *   - 选择写入 health_events (manual_adjustment 纯审计类型, 零 DDL) + 本地决策记录;
 *     选「冷静 24h」另写待回访记录 (次日回访条接棒, 用户可改判)
 *   - 卡内展示「本周三问帮你留下的钱」(放弃项金额, 用户私域, 永不进分享/荣誉面)
 *
 * 红线: 非羞辱框架 —「买吧」是正当选项且语气祝福; 金额只出现在本卡与决策记录。
 * 视觉: 与其他 chat 卡同款中性底色 (不碰拦截卡配色)。用户主动求问, 不受绿色
 * 守护开关静默 (与 48-b 冷静卡的被动拦截不同 — 入口是用户自己的问题)。
 */

import { useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { elephantMoney } from '@/lib/elephant-tone';
import { getGuardIntensity } from '@/hooks/use-guard-intensity';
import type { GuardIntensity } from '@/lib/guard-intensity';
import {
  getWeeklyGuardedAmount,
  recordPrepurchaseDecision,
  savePendingPrepurchase,
} from '@/components/chat/parts/prepurchase-store';
import type { PrepurchaseCardData, PrepurchaseDecision } from '@/types/prepurchase';

const COOLDOWN_DURATION_MS = 24 * 60 * 60 * 1000;

function parseAmount(raw: string): number | null {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function reportDecision(decision: PrepurchaseDecision, amount: number | null): void {
  // 上报失败静默 — 决策记录已落本地, 周累计照常; 不追问用户第二遍
  apiFetch('/api/buddy/health-events', {
    method: 'POST',
    body: {
      eventType: 'manual_adjustment',
      triggerSource: 'manual',
      description: `Pre-purchase three questions decision: ${decision}`,
      ...(decision === 'buy'
        ? { metadata: { source: 'prepurchase', decision } }
        : { metadata: { source: 'prepurchase', decision, ...(amount ? { guarded_amount: amount } : {}) } }),
    },
  }).catch((err: unknown) => {
    // safe to ignore: 计数上报失败不弹错不阻塞 chat
    logger.warn('[prepurchase-card] decision report failed (silently skipped):', err instanceof Error ? err.message : String(err));
  });
}

export function PrepurchaseCard({ data }: { data: PrepurchaseCardData }) {
  const { t } = useI18n();
  const [step, setStep] = useState(0); // 0..2 = 三问下标, 3 = 决策区, 4 = 已决策
  const [answers, setAnswers] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [decision, setDecision] = useState<PrepurchaseDecision | null>(null);
  const [amountDraft, setAmountDraft] = useState('');
  const intensity: GuardIntensity = getGuardIntensity();

  // 每次渲染现读 (localStorage 读, 开销可忽略) — 决策刚落库的金额立即可见
  const weekly = getWeeklyGuardedAmount();

  const answerQuestion = () => {
    const value = draft.trim();
    if (!value || step >= 3) return;
    setAnswers((prev) => [...prev, value]);
    setDraft('');
    setStep(step + 1);
  };

  const decide = (choice: PrepurchaseDecision) => {
    if (decision) return; // 防连点重复写记录
    const amount = parseAmount(amountDraft);
    setDecision(choice);
    recordPrepurchaseDecision({ decision: choice, amount });
    if (choice === 'cooldown_24h') {
      savePendingPrepurchase({
        subject: data.subject,
        askedAt: Date.now(),
        dueAt: Date.now() + COOLDOWN_DURATION_MS,
        amount,
      });
    }
    reportDecision(choice, amount);
  };

  const subjectSuffix = data.subject ? ` · ${data.subject}` : '';

  return (
    <aside
      className="mt-3 rounded-xl border border-glass-border bg-glass-fill backdrop-blur-sm p-3"
      aria-label={t('chat.prepurchase.title')}
      data-testid="prepurchase-card"
    >
      <h4 className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
        <span aria-hidden>🐘</span>
        <span>{t('chat.prepurchase.title')}{subjectSuffix}</span>
      </h4>

      {step < 3 ? (
        <div className="mt-2" data-testid={`prepurchase-q${step + 1}`}>
          <p className="text-xs leading-relaxed text-text-secondary">
            {t(`chat.prepurchase.q${step + 1}`)}
          </p>
          {answers.map((a, i) => (
            <p key={i} className="mt-1.5 text-[11px] leading-relaxed text-text-tertiary" data-testid={`prepurchase-ack-${i + 1}`}>
              🐘 {t(`chat.prepurchase.ack${i + 1}.${intensity}`)} <span className="opacity-60">— {a}</span>
            </p>
          ))}
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              answerQuestion();
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('chat.prepurchase.inputPlaceholder')}
              className="flex-1 min-w-0 rounded-lg border border-glass-border bg-glass-fill px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-emerald-500/40"
              data-testid="prepurchase-input"
            />
            <button
              type="submit"
              className="rounded-lg border border-glass-border bg-glass-fill px-3 py-1.5 text-[11px] font-medium text-text-primary transition-colors hover:border-emerald-500/30"
              data-testid="prepurchase-submit"
            >
              {t('chat.prepurchase.answerButton')}
            </button>
          </form>
        </div>
      ) : decision ? (
        <div className="mt-2 border-t border-glass-border pt-2">
          <p className="text-[11px] font-medium text-text-secondary" data-testid="prepurchase-decision-note">
            {decision === 'buy'
              ? t('chat.prepurchase.noteBuy')
              : decision === 'have_alt'
                ? t('chat.prepurchase.noteAlt')
                : t('chat.prepurchase.noteCooldown', {
                    time: new Date(Date.now() + COOLDOWN_DURATION_MS).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  })}
          </p>
          {weekly > 0 && (
            <p className="mt-1.5 text-[11px] text-text-tertiary" data-testid="prepurchase-weekly">
              🌱 {t('chat.prepurchase.weeklySaved', { amount: elephantMoney(weekly) })}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-2 border-t border-glass-border pt-2">
          {answers.map((a, i) => (
            <p key={i} className="mt-1.5 text-[11px] leading-relaxed text-text-tertiary" data-testid={`prepurchase-ack-${i + 1}`}>
              🐘 {t(`chat.prepurchase.ack${i + 1}.${intensity}`)} <span className="opacity-60">— {a}</span>
            </p>
          ))}
          <p className="mt-1.5 text-xs font-medium text-text-secondary">{t('chat.prepurchase.decideTitle')}</p>
          <input
            value={amountDraft}
            onChange={(e) => setAmountDraft(e.target.value)}
            placeholder={t('chat.prepurchase.amountLabel')}
            inputMode="decimal"
            className="mt-2 w-full rounded-lg border border-glass-border bg-glass-fill px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-emerald-500/40"
            data-testid="prepurchase-amount"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => decide('buy')}
              className="rounded-lg border border-glass-border bg-glass-fill px-3 py-1.5 text-[11px] font-medium text-text-primary transition-colors hover:border-emerald-500/30"
              data-testid="prepurchase-buy"
            >
              {t('chat.prepurchase.optionBuy')}
            </button>
            <button
              type="button"
              onClick={() => decide('have_alt')}
              className="rounded-lg border border-glass-border bg-glass-fill px-3 py-1.5 text-[11px] font-medium text-text-primary transition-colors hover:border-emerald-500/30"
              data-testid="prepurchase-alt"
            >
              {t('chat.prepurchase.optionAlt')}
            </button>
            <button
              type="button"
              onClick={() => decide('cooldown_24h')}
              className="rounded-lg border border-glass-border bg-glass-fill px-3 py-1.5 text-[11px] font-medium text-text-primary transition-colors hover:border-emerald-500/30"
              data-testid="prepurchase-cooldown"
            >
              {t('chat.prepurchase.optionCooldown')}
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
