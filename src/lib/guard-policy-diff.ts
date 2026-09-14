import { GUARD_SCOPE_CATEGORIES, type GuardScope, type GuardScopeCategory } from '@/lib/guard-scope';
import type { GuardIntensity } from '@/lib/guard-intensity';
import type { NightWindowPreset } from '@/lib/night-window';
import type { NormalizedPushPreferences, PushFrequency } from '@/lib/push/preferences';

export interface GuardPolicySnapshot {
  intensity: GuardIntensity;
  scope: GuardScope;
  nightWindow: NightWindowPreset;
  push: NormalizedPushPreferences;
  hourlyRate: number;
}

export type GuardPolicyChangeField =
  | 'intensity'
  | `scope.${GuardScopeCategory}`
  | 'nightWindow'
  | 'push.frequency'
  | `push.${keyof NormalizedPushPreferences & string}`
  | 'hourlyRate';

export interface GuardPolicyChange {
  field: GuardPolicyChangeField;
  label: BilingualText;
  before: BilingualText;
  after: BilingualText;
  effect: BilingualText;
}

export interface BilingualText {
  zh: string;
  en: string;
}

const INTENSITY_TEXT: Record<GuardIntensity, BilingualText> = {
  gentle: bilingual('温柔', 'Gentle'),
  balanced: bilingual('均衡', 'Balanced'),
  strict: bilingual('严格', 'Strict'),
};

const SCOPE_TEXT = {
  guard: bilingual('守护', 'guarded'),
  exempt: bilingual('豁免', 'exempt'),
  strict: bilingual('加严', 'strict'),
};

const CATEGORY_TEXT: Record<GuardScopeCategory, BilingualText> = {
  electronics: bilingual('数码品类', 'Electronics category'),
  clothing: bilingual('服饰品类', 'Clothing category'),
  beauty: bilingual('美妆品类', 'Beauty category'),
  home: bilingual('家居品类', 'Home category'),
  food: bilingual('饮食品类', 'Food category'),
};

const NIGHT_TEXT: Record<NightWindowPreset, BilingualText> = {
  early: bilingual('早睡型 21–24', 'Early sleeper 21:00–24:00'),
  standard: bilingual('标准型 22–05', 'Standard 22:00–05:00'),
  nightOwl: bilingual('夜猫型 0–5', 'Night owl 00:00–05:00'),
  off: bilingual('关闭', 'Off'),
};

const FREQUENCY_TEXT: Record<PushFrequency, BilingualText> = {
  daily: bilingual('每日', 'Daily'),
  weekly: bilingual('每周', 'Weekly'),
  off: bilingual('关闭', 'Off'),
};

const PUSH_TOGGLE_FIELDS = ['missYou', 'dreamFund', 'challenge', 'weeklyGuardian', 'dailyAlgorithm'] as const;

function bilingual(zh: string, en: string): BilingualText {
  return { zh, en };
}

function valueText(value: boolean | number): BilingualText {
  if (typeof value === 'number') return bilingual(`每小时 ${value}`, `${value} per hour`);
  return value ? bilingual('开启', 'On') : bilingual('关闭', 'Off');
}

function changed<T>(before: T, after: T): boolean {
  return before !== after;
}

export function diffGuardPolicy(before: GuardPolicySnapshot, after: GuardPolicySnapshot): GuardPolicyChange[] {
  const changes: GuardPolicyChange[] = [];
  if (changed(before.intensity, after.intensity)) {
    changes.push({
      field: 'intensity',
      label: bilingual('守护强度', 'Guard intensity'),
      before: INTENSITY_TEXT[before.intensity],
      after: INTENSITY_TEXT[after.intensity],
      effect: bilingual('Symy 会按新强度回应。', 'Symy will respond at the new intensity.'),
    });
  }
  for (const category of GUARD_SCOPE_CATEGORIES) {
    if (!changed(before.scope[category], after.scope[category])) continue;
    const categoryText = CATEGORY_TEXT[category];
    changes.push({
      field: `scope.${category}`,
      label: categoryText,
      before: SCOPE_TEXT[before.scope[category]],
      after: SCOPE_TEXT[after.scope[category]],
      effect:
        after.scope[category] === 'exempt'
          ? bilingual('Symy 会停止打扰这个品类。', 'Symy will stop interrupting this category.')
          : bilingual('Symy 会按新范围处理这个品类。', 'Symy will handle this category with the new scope.'),
    });
  }
  if (changed(before.nightWindow, after.nightWindow)) {
    changes.push({
      field: 'nightWindow',
      label: bilingual('深夜时段', 'Night window'),
      before: NIGHT_TEXT[before.nightWindow],
      after: NIGHT_TEXT[after.nightWindow],
      effect: bilingual('Symy 会按新时段提供夜间守护。', 'Symy will guard the new night window.'),
    });
  }
  if (changed(before.push.frequency, after.push.frequency)) {
    changes.push({
      field: 'push.frequency',
      label: bilingual('提醒节奏', 'Push frequency'),
      before: FREQUENCY_TEXT[before.push.frequency],
      after: FREQUENCY_TEXT[after.push.frequency],
      effect: bilingual('Symy 会按新节奏发送提醒。', 'Symy will send reminders at the new rhythm.'),
    });
  }
  for (const key of PUSH_TOGGLE_FIELDS) {
    if (!changed(before.push[key], after.push[key])) continue;
    changes.push({
      field: `push.${key}`,
      label: bilingual(`提醒开关：${key}`, `Push toggle: ${key}`),
      before: valueText(before.push[key]),
      after: valueText(after.push[key]),
      effect: bilingual('这个提醒类型会立即改变。', 'This reminder type will change immediately.'),
    });
  }
  if (changed(before.hourlyRate, after.hourlyRate)) {
    changes.push({
      field: 'hourlyRate',
      label: bilingual('时薪', 'Hourly rate'),
      before: valueText(before.hourlyRate),
      after: valueText(after.hourlyRate),
      effect: bilingual('仅用于你的私人守护参考。', 'Used only for your private guard reference.'),
    });
  }
  return changes;
}
