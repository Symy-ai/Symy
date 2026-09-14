/**
 * green-alt-preference-rank — 拒绝偏好介入的候选词条排序 (batch62-b, 纯函数)
 *
 * 基线 suggestAlternative 是"词表顺序先命中先赢"; 本模块在命中集合上叠加
 * 偏好排序 (打分不减员 — 用户明确问起的词条仍可见, 不永久屏蔽):
 *   1. 无任何有效偏好 → 输出与 suggestAlternative 完全一致;
 *   2. 词条级冷却词条 → 后置 (同 entry 冷却);
 *   3. 品类级降频词条 → 次后置 (同 category 降频, 误伤面小于词条级);
 *   4. 表达调整 (只看命中词条自身的词条级原因):
 *      already_have → 复用建议先行 ("你手头可能已有" 放句首, 不触发羞辱);
 *      wrong_channel → 渠道行改租借/借用先行表达。
 * 唯一命中且在冷却时仍返回该词条 (显式提问不被屏蔽)。
 */

import { greenAltCategoryOf } from './green-alt-category';
import { composeGreenAltMessage, matchGreenAltEntries } from './green-alternatives';
import { greenAltCategoryPreference, greenAltEntryPreference, type GreenAltPreferenceState } from './green-alt-preference';
import type { GreenAlternativeEntry, GreenAlternativeSuggestion, GreenLocale } from './green-alt-types';

/** wrong_channel 的渠道表达: 租借/借用先行, 词条原渠道句保留在后 */
function reuseChannelFirst(entry: GreenAlternativeEntry, locale: GreenLocale): string {
  return locale === 'zh'
    ? `租借、借用也可以: ${entry.reuseChannel[locale]}`
    : `Renting or borrowing works too: ${entry.reuseChannel[locale]}`;
}

/** already_have 的表达: 复用建议先行 (与 composeMessage 同款拼接约定: zh 无空格 / en 空格) */
function reuseFirstMessage(suggestion: GreenAlternativeSuggestion, locale: GreenLocale): string {
  return locale === 'zh'
    ? `${suggestion.reuse}${suggestion.alternative}`
    : `${suggestion.reuse} ${suggestion.alternative}`;
}

/**
 * 带偏好的绿色替代推荐。state 缺省/为空时与 suggestAlternative 逐字节同输出。
 */
export function suggestAlternativeWithPreference(
  query: string,
  locale: GreenLocale,
  state?: GreenAltPreferenceState | null,
): GreenAlternativeSuggestion | null {
  const matches = matchGreenAltEntries(query);
  if (matches.length === 0) return null;

  let ordered = matches;
  if (state && (state.byEntry.size > 0 || state.byCategory.size > 0)) {
    const fresh: GreenAlternativeEntry[] = [];
    const categoryCooling: GreenAlternativeEntry[] = [];
    const entryCooling: GreenAlternativeEntry[] = [];
    for (const entry of matches) {
      if (greenAltEntryPreference(state, entry.id)) entryCooling.push(entry);
      else if (greenAltCategoryPreference(state, greenAltCategoryOf(entry.id))) categoryCooling.push(entry);
      else fresh.push(entry);
    }
    ordered = [...fresh, ...categoryCooling, ...entryCooling];
  }

  const chosen = ordered[0];
  const suggestion = composeGreenAltMessage(chosen, locale);
  const entryPref = state ? greenAltEntryPreference(state, chosen.id) : null;
  if (entryPref?.reason === 'already_have') {
    return { ...suggestion, message: reuseFirstMessage(suggestion, locale) };
  }
  if (entryPref?.reason === 'wrong_channel') {
    return { ...suggestion, reuseChannel: reuseChannelFirst(chosen, locale) };
  }
  return suggestion;
}
