/**
 * guard-sos — SOS 降温对话的纯派生 (batch59-a)
 *
 * 面板每条 active 项的「快撑不住了」按钮打开三档回应 (再撑 N 小时 / 换替代 /
 * 放过自己), 引导话术跟随 guard-intensity 三档 (48-a 先例)。
 *
 * 红线: SOS 是求助不是认罪 — 文案层 (i18n key) 绝无羞辱措辞,
 * 由 red-line test 锁 (zh/en activeGuards.sos 子树禁「失败/浪费/没忍住」类词)。
 */

import type { GuardIntensity } from '@/lib/guard-intensity';

export type GuardSosChoice = 'hold' | 'alt' | 'release';

export interface GuardSosOption {
  id: GuardSosChoice;
  labelKey: string;
  noteKey: string;
}

export interface GuardSosTurn {
  /** 跟随 guard-intensity 的引导行 i18n key */
  leadKey: string;
  /** 三档回应 (顺序固定: 撑 / 替代 / 放过) */
  options: GuardSosOption[];
  /** hold 档话术参数: 该项剩余小时数 */
  hoursLeft: number;
}

export function buildGuardSosTurn(intensity: GuardIntensity, hoursLeft: number): GuardSosTurn {
  const safeHours = Number.isFinite(hoursLeft) && hoursLeft > 0 ? Math.ceil(hoursLeft) : 1;
  return {
    leadKey: `chat.activeGuards.sos.lead.${intensity}`,
    hoursLeft: safeHours,
    options: [
      { id: 'hold', labelKey: 'chat.activeGuards.sos.option.hold', noteKey: 'chat.activeGuards.sos.optionNote.hold' },
      { id: 'alt', labelKey: 'chat.activeGuards.sos.option.alt', noteKey: 'chat.activeGuards.sos.optionNote.alt' },
      { id: 'release', labelKey: 'chat.activeGuards.sos.option.release', noteKey: 'chat.activeGuards.sos.optionNote.release' },
    ],
  };
}

/** SOS 事件 metadata — 引用项 key + 用户选择 (写事件由面板组件执行) */
export function buildGuardSosMetadata(refKind: 'challenge' | 'commitment' | 'cooldown', refKey: string, choice: GuardSosChoice): {
  source: string;
  ref_kind: string;
  ref_key: string;
  choice: string;
} {
  return { source: 'guard_sos', ref_kind: refKind, ref_key: refKey, choice };
}
