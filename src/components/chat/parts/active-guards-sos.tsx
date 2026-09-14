'use client';

/**
 * ActiveGuardsSos — 「快撑不住了」降温对话 (batch59-a)
 *
 * 每条 active 项的 SOS 按钮打开: 引导行跟随 guard-intensity 三档 (48-a 先例)
 * + 固定三档回应 (再撑 N 小时 / 换替代 / 放过自己)。选任一档即写
 * health_events manual_adjustment (source=guard_sos + 引用项 key, 零 DDL,
 * 客户端唯一允许的纯审计类型) 并展示收尾暖句。SOS 是求助不是认罪 —
 * 文案层绝无羞辱措辞 (red-line test 锁)。
 */

import { useState } from 'react';
import { LifeBuoy, X } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { useGuardIntensity } from '@/hooks/use-guard-intensity';
import { dateKeyOf } from '@/lib/green-commitment';
import { buildGuardSosMetadata, buildGuardSosTurn, type GuardSosChoice } from '@/lib/guard-sos';

export interface ActiveGuardsSosProps {
  refKind: 'challenge' | 'commitment' | 'cooldown';
  refKey: string;
  /** 该项剩余小时数 (hold 档话术参数) */
  hoursLeft: number;
  onClose: () => void;
}

export function ActiveGuardsSos({ refKind, refKey, hoursLeft, onClose }: ActiveGuardsSosProps) {
  const { t } = useI18n();
  const { guardIntensity } = useGuardIntensity();
  const [chosen, setChosen] = useState<GuardSosChoice | null>(null);

  const turn = buildGuardSosTurn(guardIntensity, hoursLeft);

  const choose = async (choice: GuardSosChoice) => {
    if (chosen) return; // 防连点
    setChosen(choice);
    try {
      await apiFetch('/api/buddy/health-events', {
        method: 'POST',
        body: {
          eventType: 'manual_adjustment',
          triggerSource: 'manual',
          triggerId: dateKeyOf(new Date()),
          description: `Guard SOS de-escalation (${choice}) for ${refKind}`,
          metadata: buildGuardSosMetadata(refKind, refKey, choice),
        },
      });
    } catch (err) {
      // safe to ignore: 计数上报失败不弹错不阻塞降温对话 (收尾暖句照常展示)
      logger.warn('[active-guards-sos] report failed (silently skipped):', err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div
      className="mt-1.5 rounded-xl border border-glass-border bg-glass-fill p-2.5"
      data-testid="active-guards-sos"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
          <LifeBuoy className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
          {t('chat.activeGuards.sos.title')}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('chat.activeGuards.closeBtn')}
          className="text-text-tertiary transition-colors hover:text-text-primary"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {chosen ? (
        <p className="mt-2 text-xs leading-relaxed text-text-secondary" data-testid="active-guards-sos-done">
          🐘 {t(`chat.activeGuards.sos.done.${chosen}`)}
        </p>
      ) : (
        <>
          <p className="mt-1.5 text-xs leading-relaxed text-text-secondary" data-testid="active-guards-sos-lead">
            {t(turn.leadKey)}
          </p>
          <div className="mt-2 space-y-1.5">
            {turn.options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => choose(option.id)}
                data-testid={`active-guards-sos-${option.id}`}
                className="w-full rounded-lg border border-glass-border bg-glass-fill px-2.5 py-1.5 text-left transition-colors hover:border-emerald-500/30"
              >
                <span className="block text-[11px] font-medium text-text-primary">
                  {t(option.labelKey, { hours: String(turn.hoursLeft) })}
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-text-tertiary">
                  {t(option.noteKey)}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
