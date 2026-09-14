'use client';

/**
 * applyGuardianStylePlan — 把守护风格计划逐项写回既有渠道 (batch61-a)
 *
 * 三个本地渠道 (守护强度 / 深夜时段 / 守护范围) 走各 hook 的 module 级 setter,
 * 提醒节奏走既有 PATCH /api/push/preferences (batch60-b 偏好中心唯一写入口,
 * 服务端读存量合并) — 不碰 cron 与调度, 零 DDL。
 *
 * 顺序: 先本地后网络。推送失败不回滚本地三项 (都是既有设置语义的原生值),
 * 结果以 outcome 诚实返回, 由 UI 层展示并允许重试 (再点一次完成, 幂等)。
 */

import { GUARD_SCOPE_CATEGORIES } from '@/lib/guard-scope';
import type { GuardianStylePlan } from '@/lib/guardian-style';
import { setGuardIntensity } from '@/hooks/use-guard-intensity';
import { setNightWindow } from '@/hooks/use-night-window';
import { setGuardScopeMode } from '@/hooks/use-guard-scope';

export type GuardianStyleApplyOutcome = 'ok' | 'pushNotSubscribed' | 'pushFailed';

export interface GuardianStyleApplyOptions {
  /** demo 模式与推送设置区块同语义: 只写本地, 不发 PATCH */
  isDemo?: boolean;
  savePushPreferences?: (patch: { frequency: GuardianStylePlan['pushFrequency'] }) => Promise<boolean>;
}

export async function applyGuardianStylePlan(
  plan: GuardianStylePlan,
  options?: GuardianStyleApplyOptions,
): Promise<GuardianStyleApplyOutcome> {
  setGuardIntensity(plan.guardIntensity);
  setNightWindow(plan.nightWindow);
  for (const category of GUARD_SCOPE_CATEGORIES) {
    setGuardScopeMode(category, plan.guardScope[category]);
  }

  if (options?.isDemo) return 'ok';

  try {
    if (options?.savePushPreferences) {
      return (await options.savePushPreferences({ frequency: plan.pushFrequency })) ? 'ok' : 'pushFailed';
    }
    const res = await fetch('/api/push/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ frequency: plan.pushFrequency }),
    });
    if (res.ok) return 'ok';
    // 409 = 尚无订阅行 (推送未开启) — 服务端无处可写, 不视为故障
    if (res.status === 409) return 'pushNotSubscribed';
    return 'pushFailed';
  } catch {
    // safe to ignore: outcome 由 UI 层诚实展示, 重试 = 再点一次完成
    return 'pushFailed';
  }
}
