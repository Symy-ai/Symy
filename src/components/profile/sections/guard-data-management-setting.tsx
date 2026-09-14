'use client';

/**
 * GuardDataManagementSetting — 设置页「守护数据管理」区块 (batch59-b)
 *
 * 自包含组件 (58-b GuardProfileExportSetting 先例): 三件事 —
 *   1. 数据规模总览 (N 条 · M 天 · 最早记录, <5 条 warm note 降级);
 *   2. 分类清除 (仅拦截 / 仅替代与复用 / 全部): 确认弹层含将删除条数/天数
 *      + estSaved 合计知情提醒 (App 内私享, planGuardDataResetPrivateImpact),
 *      确认后 POST /api/buddy/health-events/reset (零 DDL 行删除 + 对账行);
 *   3. 恢复默认设置: 清 localStorage 三键 (intensity/scope/night-window) +
 *      时薪回写出厂值 (服务端持久化), 下次读取自动回默认。
 *
 * 全部清除完成后展示一次性庆祝卡 ("新的一章开始 · 小象陪你重新出发"),
 * 勋章/段位独立于 health_events, 自然保留。非羞辱框架: 清除叙事是
 * "轻装" 不是 "抹黑历史"。金额只出现在确认弹层 (in-app 私有)。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eraser } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { fetchGuardStyleEvents } from '@/hooks/use-guard-style-profile';
import { DEFAULT_HOURLY_RATE, useHourlyRate } from '@/hooks/use-hourly-rate';
import {
  planGuardDataReset,
  planGuardDataResetPrivateImpact,
  summarizeGuardData,
  type GuardResetLane,
  type GuardResetEventInput,
} from '@/lib/guard-data-reset';

/** 恢复默认要清的 localStorage 键 (以各 hook 实际 key 为准) */
const SETTINGS_STORAGE_KEYS = ['symy-guard-intensity', 'symy-guard-scope', 'symy-night-window'];

type PendingAction = GuardResetLane | 'settings';

export function GuardDataManagementSetting({ isDemo = false }: { isDemo?: boolean }) {
  const { t, locale } = useI18n();
  const { setHourlyRate } = useHourlyRate(isDemo);
  const [events, setEvents] = useState<GuardResetEventInput[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [celebrating, setCelebrating] = useState(false);

  const reloadEvents = useCallback(() => {
    fetchGuardStyleEvents()
      .then((list) => {
        setEvents(list);
        setLoadFailed(false);
      })
      .catch(() => {
        // safe to ignore: 总览是非关键展示路径, 失败静默降级
        setLoadFailed(true);
      });
  }, []);

  useEffect(() => {
    reloadEvents();
  }, [reloadEvents]);

  const overview = useMemo(() => summarizeGuardData(events), [events]);

  const plan = useMemo(
    () =>
      pending && pending !== 'settings'
        ? {
            reset: planGuardDataReset(events, pending),
            impact: planGuardDataResetPrivateImpact(events, pending),
          }
        : null,
    [events, pending],
  );

  // eslint-disable-next-line symy/no-async-callback-mutation -- busy 态即 in-flight 守卫, 确认按钮 disabled 防重入
  const confirmPending = useCallback(async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      if (pending === 'settings') {
        for (const key of SETTINGS_STORAGE_KEYS) {
          window.localStorage.removeItem(key);
        }
        // 时薪是服务端持久化 (无 localStorage), 恢复出厂 = 回写默认值
        try {
          await setHourlyRate(DEFAULT_HOURLY_RATE);
        } catch {
          // safe to ignore: 回写失败不阻塞其余恢复, 下次保存时仍可纠正
          logger.warn('[GuardDataManagement] reset hourly rate failed');
        }
      } else {
        await apiFetch('/api/buddy/health-events/reset', {
          method: 'POST',
          body: { lane: pending },
        });
        if (pending === 'all') setCelebrating(true);
        reloadEvents();
      }
      setPending(null);
    } catch (err) {
      // safe to ignore: 清除是非关键路径, 失败不弹层打扰, 下次点击重试即可
      logger.warn(
        '[GuardDataManagement] action failed:',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setBusy(false);
    }
  }, [pending, busy, setHourlyRate, reloadEvents]);

  const earliestLabel = overview.earliestDate
    ? overview.earliestDate.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <div
      className="flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill"
      data-testid="guard-data-management-block"
    >
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
        <Eraser className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{t('profile.guardDataTitle')}</p>
        <p className="text-xs text-text-tertiary mb-2">{t('profile.guardDataDesc')}</p>

        {celebrating && (
          <div
            className="mb-3 p-3 rounded-lg border border-cyan-500/40 bg-cyan-500/5"
            data-testid="guard-data-celebration"
          >
            <p className="text-sm font-medium text-text-primary">
              {t('profile.guardDataNewChapterTitle')}
            </p>
            <p className="text-xs text-text-secondary mt-1">{t('profile.guardDataNewChapterBody')}</p>
            <p className="text-[11px] text-text-tertiary mt-1">{t('profile.guardDataRetainedNote')}</p>
            <button
              onClick={() => setCelebrating(false)}
              className="mt-2 px-3 py-1.5 text-xs rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-medium hover:from-cyan-400 hover:to-purple-400 transition-all cursor-pointer"
              data-testid="guard-data-celebration-dismiss"
            >
              {t('profile.guardDataDismiss')}
            </button>
          </div>
        )}

        {loadFailed ? (
          <p className="text-[11px] text-text-tertiary mb-2" data-testid="guard-data-load-failed">
            {t('profile.guardDataLoadFailed')}
          </p>
        ) : (
          <p className="text-xs text-text-secondary mb-1" data-testid="guard-data-stats">
            {overview.status === 'empty'
              ? t('profile.guardDataEmptyNote')
              : `${overview.totalEvents} ${t('profile.guardDataUnitEvents')} · ${t('profile.guardDataCoveredPrefix')}${overview.activeDays} ${t('profile.guardDataUnitDays')}${earliestLabel ? ` · ${t('profile.guardDataEarliestPrefix')}${earliestLabel}` : ''}`}
            {overview.status === 'insufficient' && (
              <span className="block text-[11px] text-text-tertiary mt-1">
                {t('profile.guardDataWarmNote')}
              </span>
            )}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setPending('challenge')}
            className="px-3 py-1.5 text-xs rounded-lg border border-glass-border bg-glass-fill text-text-secondary hover:bg-glass-hover transition-colors cursor-pointer"
            data-testid="guard-data-clear-challenge"
          >
            {t('profile.guardDataClearChallenge')}
          </button>
          <button
            onClick={() => setPending('alt_reuse')}
            className="px-3 py-1.5 text-xs rounded-lg border border-glass-border bg-glass-fill text-text-secondary hover:bg-glass-hover transition-colors cursor-pointer"
            data-testid="guard-data-clear-alt-reuse"
          >
            {t('profile.guardDataClearAltReuse')}
          </button>
          <button
            onClick={() => setPending('all')}
            className="px-3 py-1.5 text-xs rounded-lg border border-glass-border bg-glass-fill text-text-secondary hover:bg-glass-hover transition-colors cursor-pointer"
            data-testid="guard-data-clear-all"
          >
            {t('profile.guardDataClearAll')}
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-text-tertiary">{t('profile.guardDataResetSettingsTitle')}</span>
          <button
            onClick={() => setPending('settings')}
            className="px-3 py-1 text-[11px] rounded-lg border border-glass-border bg-glass-fill text-text-tertiary hover:bg-glass-hover transition-colors cursor-pointer"
            data-testid="guard-data-reset-settings"
          >
            {t('profile.guardDataResetSettingsButton')}
          </button>
        </div>

        {pending && (
          <div
            className="mt-3 p-3 rounded-lg border border-glass-border bg-glass-fill"
            data-testid="guard-data-confirm"
          >
            <p className="text-sm font-medium text-text-primary">{t('profile.guardDataConfirmTitle')}</p>
            {plan ? (
              <>
                <p className="text-xs text-text-secondary mt-1" data-testid="guard-data-confirm-scope">
                  {`${plan.reset.eventCount} ${t('profile.guardDataUnitEvents')} · ${t('profile.guardDataCoveredPrefix')}${plan.reset.coveredDays} ${t('profile.guardDataUnitDays')}`}
                </p>
                {/* 知情提醒: estSaved 合计 — App 内私享 only, 永不进分享/荣誉面 */}
                <p
                  className="text-xs text-text-secondary mt-1"
                  data-testid="guard-data-confirm-impact"
                >
                  {`${t('profile.guardDataImpactPrefix')}$${plan.impact.estSavedTotal.toFixed(0)}${t('profile.guardDataImpactSuffix')}`}
                </p>
                {plan.reset.eventCount > 0 && (
                  <p className="text-[11px] text-text-tertiary mt-1">
                    {`${t('profile.guardDataRetainedPrefix')}${plan.reset.retained.challenge + plan.reset.retained.alt + plan.reset.retained.reuse} ${t('profile.guardDataUnitEvents')}${t('profile.guardDataRetainedSuffix')}`}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-text-secondary mt-1" data-testid="guard-data-confirm-scope">
                {t('profile.guardDataConfirmSettings')}
              </p>
            )}
            <p className="text-[11px] text-text-tertiary mt-1">{t('profile.guardDataConfirmKeep')}</p>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => void confirmPending()}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-medium hover:from-cyan-400 hover:to-purple-400 transition-all cursor-pointer disabled:opacity-50"
                data-testid="guard-data-confirm-go"
              >
                {t('profile.guardDataConfirmGo')}
              </button>
              <button
                onClick={() => setPending(null)}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded-lg border border-glass-border bg-glass-fill text-text-secondary hover:bg-glass-hover transition-colors cursor-pointer disabled:opacity-50"
                data-testid="guard-data-confirm-cancel"
              >
                {t('profile.guardDataConfirmCancel')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
