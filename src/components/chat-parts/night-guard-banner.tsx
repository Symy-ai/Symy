'use client';

/**
 * NightGuardBanner — 深夜守护横幅 (batch48-c)
 *
 * 仅当 [高危时段 = 深夜 且 当前时刻落在深夜窗口] 时在 chat 顶部渲染单行横幅。
 * 纯客户端 Date 判断 (本地时区, 无定时器轮询); now 仅测试注入用。
 * 文案走陪伴叙事 ("小象陪你熬夜把关"), 无金额无羞辱。
 */

import { MoonStar } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useImpulseWindow } from '@/hooks/use-impulse-window';
import { useNightWindow } from '@/hooks/use-night-window';
import { isDateInWindow } from '@/lib/impulse-window';
import { nightWindowToHours } from '@/lib/night-window';

export interface NightGuardBannerProps {
  /** 测试注入固定时刻; 生产不传, 渲染期取一次 */
  now?: Date;
}

export function NightGuardBanner({ now }: NightGuardBannerProps = {}) {
  const { t } = useI18n();
  const { summary, isLoading } = useImpulseWindow();
  const { nightWindow } = useNightWindow();

  // 用户选「关闭」→ banner 永不渲染 (统计卡照常, 数据透明)
  if (nightWindow === 'off') return null;
  if (isLoading || !summary) return null;
  if (!summary.dominant || summary.topWindow !== 'lateNight') return null;
  if (!isDateInWindow(now ?? new Date(), 'lateNight', nightWindowToHours(nightWindow))) return null;

  return (
    <div
      className="mx-3 mt-2 flex items-center gap-2 rounded-xl border border-glass-border bg-glass-fill px-3 py-2"
      data-testid="night-guard-banner"
    >
      <MoonStar className="h-4 w-4 shrink-0 text-icon-muted" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-text-secondary">
        {t('chat.nightGuardBanner')}
      </p>
    </div>
  );
}
