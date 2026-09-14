'use client';

/**
 * EmotionGuardCard — 情绪守护三选项卡 (batch60-c)
 *
 * 用户带着情绪提起购买时, 小象共情回复气泡下方渲染本卡。三条路, 选择权在用户:
 *   - 花钱安慰 (不评判): 真诚祝福, 零事件写入; 可展开既有买前三问卡盘盘账
 *   - 免费安抚: 按 mood 给 3 个小象建议, 确认后写一次 manual_adjustment 审计
 *     (choice=free_care, 同 mood 同日幂等)
 *   - 先等 10 分钟: localStorage one-shot 等待, 卡内计时到期追问「现在还想买吗」;
 *     还想要=祝福 (零事件), 放下了=写一次审计 (choice=wait_passed)。刷新后由
 *     chat 级 EmotionGuardCheckin 追问条接棒 (emotion-guard-store 同一记录)。
 *
 * 守护强度三档: gentle 只共情给空间 (不渲染选项); balanced 默认三选项;
 * strict 追加 10 分钟建议 — 但绝不禁止购买, 零羞辱措辞。
 * 红线: 卡面零金额零物品名; metadata 只有 source/mood/choice。
 */

import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { PrepurchaseCard } from '@/components/chat/parts/prepurchase-card';
import {
  EMOTION_WAIT_DURATION_MS,
  getEmotionWait,
  reportEmotionGuardEvent,
  resolveEmotionWait,
  saveEmotionWait,
} from '@/components/chat/parts/emotion-guard-store';
import type { EmotionGuardCardData } from '@/types/emotion-guard';

const CARE_SUGGESTION_KEYS = ['one', 'two', 'three'] as const;

function formatCountdown(msLeft: number): string {
  const totalSeconds = Math.max(0, Math.ceil(msLeft / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

type CardBranch = 'choose' | 'spend' | 'care' | 'waiting' | 'checkin';

export function EmotionGuardCard({ data }: { data: EmotionGuardCardData }) {
  const { t } = useI18n();
  const [branch, setBranch] = useState<CardBranch>('choose');
  const [showThreeQuestions, setShowThreeQuestions] = useState(false);
  const [careDone, setCareDone] = useState(false);
  const [checkinAnswered, setCheckinAnswered] = useState<'want' | 'passed' | null>(null);
  const [countdown, setCountdown] = useState(EMOTION_WAIT_DURATION_MS);

  // 等待中的 one-shot 计时: 每秒对齐 localStorage 记录 — 到期切追问;
  // 记录被外部消解 (刷新后追问条/取消) → 回到选项, 不追问。
  useEffect(() => {
    if (branch !== 'waiting') return;
    const tick = () => {
      const record = getEmotionWait();
      if (!record) {
        setBranch('choose');
        return;
      }
      const msLeft = record.dueAt - Date.now();
      setCountdown(msLeft);
      if (msLeft <= 0) setBranch('checkin');
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [branch]);

  const chooseWait = () => {
    saveEmotionWait(data.mood);
    setCountdown(EMOTION_WAIT_DURATION_MS);
    setBranch('waiting');
  };

  const confirmFreeCare = () => {
    if (careDone) return; // 防连点 — store 内另有同日幂等
    setCareDone(true);
    reportEmotionGuardEvent(data.mood, 'free_care');
  };

  const answerCheckin = (stillWant: boolean) => {
    if (checkinAnswered) return;
    resolveEmotionWait();
    setCheckinAnswered(stillWant ? 'want' : 'passed');
    if (stillWant) return; // 祝福分支零上报 — 买了不评判
    reportEmotionGuardEvent(data.mood, 'wait_passed');
  };

  const optionButtonClass = 'rounded-lg border border-glass-border bg-glass-fill px-3 py-1.5 text-[11px] font-medium text-text-primary transition-colors hover:border-emerald-500/30';

  return (
    <aside
      className="mt-3 rounded-xl border border-glass-border bg-glass-fill backdrop-blur-sm p-3"
      aria-label={t('chat.emotionGuard.title')}
      data-testid="emotion-guard-card"
    >
      <h4 className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
        <span aria-hidden>🐘</span>
        <span>{t('chat.emotionGuard.title')}</span>
      </h4>
      <p className="mt-1.5 text-xs leading-relaxed text-text-secondary" data-testid="emotion-guard-empathy">
        {t(`chat.emotionGuard.empathy.${data.mood}`)}
      </p>

      {data.intensity === 'gentle' ? (
        // gentle 只共情给空间 — 不渲染选项, 不推任何一条路
        <p className="mt-2 text-[11px] leading-relaxed text-text-tertiary" data-testid="emotion-guard-gentle-space">
          {t('chat.emotionGuard.gentleSpace')}
        </p>
      ) : branch === 'choose' ? (
        <div className="mt-2 border-t border-glass-border pt-2" data-testid="emotion-guard-choose">
          {data.intensity === 'strict' && (
            <p className="mb-2 text-[11px] leading-relaxed text-text-tertiary" data-testid="emotion-guard-strict-nudge">
              {t('chat.emotionGuard.strictWaitNudge')}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setBranch('spend')} className={optionButtonClass} data-testid="emotion-guard-spend">
              {t('chat.emotionGuard.optionSpend')}
            </button>
            <button type="button" onClick={() => setBranch('care')} className={optionButtonClass} data-testid="emotion-guard-care">
              {t('chat.emotionGuard.optionFreeCare')}
            </button>
            <button type="button" onClick={chooseWait} className={optionButtonClass} data-testid="emotion-guard-wait">
              {t('chat.emotionGuard.optionWait')}
            </button>
          </div>
        </div>
      ) : branch === 'spend' ? (
        <div className="mt-2 border-t border-glass-border pt-2" data-testid="emotion-guard-spend-panel">
          <p className="text-[11px] leading-relaxed text-text-secondary" data-testid="emotion-guard-blessing">
            {t('chat.emotionGuard.spendBlessing')}
          </p>
          {!showThreeQuestions && (
            <button
              type="button"
              onClick={() => setShowThreeQuestions(true)}
              className="mt-2 rounded-lg border border-glass-border bg-glass-fill px-3 py-1.5 text-[11px] font-medium text-text-primary transition-colors hover:border-emerald-500/30"
              data-testid="emotion-guard-three-questions"
            >
              {t('chat.emotionGuard.spendThreeQuestions')}
            </button>
          )}
          {showThreeQuestions && <PrepurchaseCard data={{ subject: null }} />}
        </div>
      ) : branch === 'care' ? (
        <div className="mt-2 border-t border-glass-border pt-2" data-testid="emotion-guard-care-panel">
          <p className="text-[11px] font-medium text-text-secondary">{t('chat.emotionGuard.freeCareTitle')}</p>
          <ul className="mt-1.5 space-y-1">
            {CARE_SUGGESTION_KEYS.map((key) => (
              <li key={key} className="text-[11px] leading-relaxed text-text-secondary" data-testid={`emotion-guard-care-item-${key}`}>
                🌱 {t(`chat.emotionGuard.care.${data.mood}.${key}`)}
              </li>
            ))}
          </ul>
          {careDone ? (
            <p className="mt-2 text-[11px] leading-relaxed text-text-secondary" data-testid="emotion-guard-care-done">
              {t('chat.emotionGuard.freeCareDone')}
            </p>
          ) : (
            <button type="button" onClick={confirmFreeCare} className={`${optionButtonClass} mt-2`} data-testid="emotion-guard-confirm-care">
              {t('chat.emotionGuard.freeCareConfirm')}
            </button>
          )}
        </div>
      ) : branch === 'waiting' ? (
        <div className="mt-2 border-t border-glass-border pt-2" data-testid="emotion-guard-waiting">
          <p className="text-[11px] leading-relaxed text-text-secondary">{t('chat.emotionGuard.waitStarted')}</p>
          <p className="mt-1.5 text-[11px] tabular-nums text-text-tertiary" data-testid="emotion-guard-countdown">
            {t('chat.emotionGuard.waitCountdown', { time: formatCountdown(countdown) })}
          </p>
          <button
            type="button"
            onClick={() => {
              resolveEmotionWait();
              setBranch('choose');
            }}
            className="mt-2 rounded-lg px-2 py-1 text-[11px] font-medium text-text-tertiary transition-colors hover:text-text-secondary"
            data-testid="emotion-guard-cancel"
          >
            {t('chat.emotionGuard.waitCancel')}
          </button>
        </div>
      ) : checkinAnswered ? (
        <div className="mt-2 border-t border-glass-border pt-2" data-testid="emotion-guard-checkin-answered">
          <p className="text-[11px] leading-relaxed text-text-secondary">
            🐘 {checkinAnswered === 'want' ? t('chat.emotionGuard.checkinBlessing') : t('chat.emotionGuard.checkinSuccessNote')}
          </p>
        </div>
      ) : (
        <div className="mt-2 border-t border-glass-border pt-2" data-testid="emotion-guard-checkin">
          <p className="text-[11px] font-medium text-text-secondary">{t('chat.emotionGuard.checkinQuestion')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => answerCheckin(true)} className={optionButtonClass} data-testid="emotion-guard-still-want">
              {t('chat.emotionGuard.checkinStillWant')}
            </button>
            <button type="button" onClick={() => answerCheckin(false)} className={optionButtonClass} data-testid="emotion-guard-let-go">
              {t('chat.emotionGuard.checkinLetGo')}
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
