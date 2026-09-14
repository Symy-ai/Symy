/**
 * Demo reply generator — extracted from chat-tab.tsx
 *
 * 🔧 ARCH fix (Round 60 — god component 拆分):
 *    从 chat-tab.tsx 提取 getDemoReply (~18 行)。
 * 🔧 Aha Moment fix: Challenge 模式下给出真正的挑战回复 (不是 "In the full version...")
 * 🔧 Magic Mirror-mode refactor: Demo replies follow the magic mirror philosophy. [已废弃]
 * 🐘 人设转型 (2026-09-05): 镜子风格已死 → 绿色环保小象。
 *    所有 demo 回复改为小象声音 (有体温、会庆祝、不评判), 话术 SSOT:
 *    src/lib/elephant-tone.ts (表驱动双语, 传 locale 取词)。
 *    签名变更: t: (key) => string 参数替换为 locale: ElephantLocale —
 *    demo 回复不再走 i18n JSON (旧 demo.aiResponses.* key 保持原样不动)。
 * 🔧 Round 120: BNPL 关键词检测 — Demo 模式也能识别 BNPL 诱导并警告
 */

import { calcLifeHours } from '@/lib/mcp-tools/handlers/descriptions';
import { detectBNPL } from '@/lib/bnpl-detector';
import {
  elephantGenericVars,
  elephantHours,
  elephantMoney,
  getElephantPhrase,
  normalizeElephantLocale,
  type ElephantLocale,
  type ElephantScene,
} from '@/lib/elephant-tone';
import { DEFAULT_HOURLY_RATE } from '@/lib/freedom-time';

/** Demo mode default hourly rate (unauthenticated users have no profile). */
const DEMO_HOURLY_RATE = DEFAULT_HOURLY_RATE;

/**
 * 🔧 Brief D1a: Demo 模式下 See It (saw it) 完成后触发庆祝动画
 *
 * Normal 模式通过 /api/challenge/complete 获取 rewardTier 并 dispatch variable-reward 事件。
 * Demo 模式没有 API 调用, 所以庆祝动画从未触发 — 多巴胺回路断裂。
 *
 * 此 helper 在 demo 路径补上 variable-reward 事件, 让 VariableRewardOverlay 显示。
 * rewardTier 用 'card' (中等稀有度), 给 demo 用户足够的视觉正反馈。
 *
 * @param amount 用户保住的金额
 */
export function triggerDemoSeeItCelebration(amount: number): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('variable-reward', {
    detail: {
      rewardTier: 'card' as const,
      bonusTokens: 0,
      bonusVitality: 0,
      savedAmount: amount,
    },
  }));
}

/**
 * 🐘 判断 demo 回复是否是 "saw it" 成功路径 (庆祝动画触发条件)。
 *
 * 旧实现硬编码英文子串匹配 (reply.includes('You saw it') && includes('stays')),
 * 中文回复永远不触发。新实现: saw_it 场景话术必含金额与「stays/留住」标记,
 * 双语都能命中。
 */
export function isDemoSawItReply(reply: string, amount: number): boolean {
  const amountStr = amount.toFixed(2);
  if (!reply.includes(amountStr)) return false;
  return reply.includes('stays') || reply.includes('留住');
}

export function getDemoReply(userInput: string, locale: string): string {
  const lang: ElephantLocale = normalizeElephantLocale(locale);
  const input = userInput.toLowerCase();

  // 🔧 Round 120: BNPL 检测 — 优先于其他检测 (BNPL 是最危险的债务诱导)
  const bnplResult = detectBNPL(userInput);
  if (bnplResult.detected) {
    return getElephantPhrase('demo_bnpl', lang);
  }

  // 🔧 Round 127 fix: 先检测 resist (含 "didn't buy", "not buy") 再检测 buy
  //   旧代码: buy 检测在 resist 之前, "I didn't buy" 匹配 buy (含 'buy') 而非 resist
  // 🔧 Round 129 fix: 加 'not to buy' / 'won't buy' / 'don't buy' 关键词
  if (input.includes('resist') || input.includes('didn\'t buy') || input.includes('did not buy') || input.includes('not buy') || input.includes('not to buy') || input.includes('won\'t buy') || input.includes('don\'t buy') || input.includes('stopped') || input.includes('忍住') || input.includes('没买')) {
    return getElephantPhrase('demo_resist', lang);
  }
  if (input.includes('bought') || input.includes('buy') || input.includes('purchase') || input.includes('买')) {
    return getElephantPhrase('demo_impulse', lang);
  }
  // 🔧 Round 128 fix: 'return' 改为 /\breturn\b/ — 避免 "in return" / "return on investment" 误匹配
  if (input.includes('refund') || /\breturn\b/.test(input) || input.includes('退款') || input.includes('退货')) {
    return getElephantPhrase('demo_refund', lang);
  }
  if (input.includes('pattern') || input.includes('habit') || input.includes('spending') || input.includes('习惯') || input.includes('模式')) {
    return getElephantPhrase('demo_pattern', lang);
  }
  return getElephantPhrase('demo_default', lang);
}

/**
 * 🔧 P0-5 fix: 检测用户消息是否是挑战的"后续消息" (非系统模板, 非关键词)
 *
 * 系统模板有多种格式:
 *   1. "I'm moved by X · $Y · Let me see it" — buddy-tab.tsx 挑战主路径
 *   2. "I want to buy X for $Y. Challenge me!" — buildChallengeDisplayMessage fallback (直接 URL 访问 chat tab)
 * 中文模板:
 *   3. "我被 X · $Y · 让我看见" — i18n 中文
 *   4. "我想买 X，要 $Y。让我看见！" — i18n 中文 fallback
 * resume 路径:
 *   5. "I'm back — let's continue the X challenge where we left off."
 *   6. "我回来了，继续挑战"
 *
 * 用户后续消息: 任何其他文字 (如 "But I really want it", "my friends have it")
 */
export function isChallengeFirstTriggerMessage(content: string): boolean {
  const trimmed = content.trim().toLowerCase();
  if (!trimmed) return false;
  // 英文主模板: "I'm moved by X · $Y · Let me see it"
  if (trimmed.startsWith("i'm moved by")) return true;
  // 英文 fallback 模板: "I want to buy X for $Y. Challenge me!"
  if (trimmed.startsWith('i want to buy') && trimmed.includes('challenge me')) return true;
  // 中文主模板: "我被 X · $Y · 让我看见"
  if (trimmed.startsWith('我被')) return true;
  // 中文 fallback 模板: "我想买 X，要 $Y。让我看见！"
  if (trimmed.startsWith('我想买') && trimmed.includes('让我看见')) return true;
  // resume 路径: "I'm back — let's continue the X challenge where we left off."
  if (trimmed.startsWith("i'm back —")) return true;
  if (trimmed.startsWith('我回来了')) return true;
  return false;
}

/**
 * 🔧 P0-5 fix: 根据用户后续消息的内容, 选择最合适的 follow-up 回复
 *
 * 不复读第一次的 "item + price + hours", 而是承认情绪 + 引导 sign up
 * 根据关键词细分 (want / friends / need) 给不同回复, 避免单调
 * 🐘 小象版: 承认情绪 → 温和点拨 → 引导注册
 */
function getChallengeFollowUpReply(
  userInput: string,
  lang: ElephantLocale,
): string {
  const input = userInput.toLowerCase();

  const sceneByKeyword: Array<{ match: () => boolean; scene: ElephantScene }> = [
    {
      // 同侪压力 / 朋友都有
      match: () => input.includes('friend') || input.includes('everyone') || input.includes('其他人') || input.includes('朋友') || input.includes('都有'),
      scene: 'followup_friends',
    },
    {
      // 渴望 / 想要
      match: () => input.includes('want') || input.includes('desire') || input.includes('crave') || input.includes('想要') || input.includes('渴望'),
      scene: 'followup_want',
    },
    {
      // 需要 / 值得
      match: () => input.includes('need') || input.includes('deserve') || input.includes('should') || input.includes('需要') || input.includes('值得') || input.includes('应该'),
      scene: 'followup_need',
    },
  ];
  for (const { match, scene } of sceneByKeyword) {
    if (match()) return getElephantPhrase(scene, lang);
  }
  // 默认 follow-up
  return getElephantPhrase('followup_default', lang);
}

/**
 * 🐘 Demo challenge replies — 绿色环保小象声音 (镜子声音已废弃)。
 *
 * The little elephant:
 * - Welcomes the challenge warmly, names item + price + hours (Freedom Translation)
 * - When user resists: celebrates specifically — "{amount} 留住啦！你在做对的事！"
 * - When user buys: no judgment — "你的选择，本象陪着你。"
 * - Follow-ups: acknowledges the feeling + guides sign-up, never repeats the first reflection
 */
export function getDemoChallengeReply(
  userInput: string,
  challengeContext: { itemName: string; amount: number } | undefined,
  locale: string,
  // 🔧 P0-5 fix: isFollowUp=true 时, fallback 路径走"承认情绪 + 不复读"回复
  //   调用方通过 isChallengeFirstTriggerMessage(content) 判断
  //   - 第一次挑战触发 (系统模板 "I'm moved by..."): isFollowUp=false → 走 item + price + hours 回复
  //   - 后续用户消息: isFollowUp=true → 走 getChallengeFollowUpReply, 不复读
  isFollowUp = false,
): string {
  const lang: ElephantLocale = normalizeElephantLocale(locale);
  const input = userInput.toLowerCase();

  // 🔧 Round 120: BNPL 检测 — challenge 模式也检测 BNPL
  //   当用户输入含 BNPL 关键词 (Klarna/Afterpay/"4 payments" 等), 返回 BNPL 警告
  //   优先于其他检测, 因为 BNPL 是最危险的债务诱导
  const bnplMessage = userInput + ' ' + (challengeContext?.itemName || '');
  const bnplResult = detectBNPL(bnplMessage, challengeContext?.amount);
  if (bnplResult.detected && challengeContext) {
    const hours = calcLifeHours(challengeContext.amount, DEMO_HOURLY_RATE).toFixed(1);
    // 🐘 BNPL 挑战回复: 物品 + 价格 + 生命小时 (小象呈现, 按语言) + BNPL 提醒
    const prefix = lang === 'zh'
      ? `${challengeContext.itemName}，${elephantMoney(challengeContext.amount)}——大约${elephantHours(hours, lang)}。`
      : `${challengeContext.itemName}. ${elephantMoney(challengeContext.amount)} — about ${elephantHours(hours, lang)}. `;
    return prefix + getElephantPhrase('demo_bnpl', lang);
  }

  // User says "I'll save" / "resist" / "saw it" / "忍" / "不买" → they decided NOT to buy
  // 🔧 Round 124 fix: 加 'saw' 检测 — handleSawIt 的 actionContent 是 "✓ Saw it"
  // 🔧 Round 125 fix: 加 '看见了' 检测 — 中文 actionContent 是 "✓ 看见了"
  // 🔧 Round 128 fix: 'right'/'pass' 改为词边界匹配, 避免误命中 (见 git history)
  // 🔧 Round 129 fix: 加 'not to buy' / 'won't buy' / 'don't buy' / 'didn't buy' 关键词
  if (input.includes('save') || input.includes('resist') || /\bright\b/.test(input) || /\bpass\b/.test(input) || input.includes('saw') || input.includes('not to buy') || input.includes('won\'t buy') || input.includes('don\'t buy') || input.includes('didn\'t buy') || input.includes('忍') || input.includes('不买') || input.includes('省') || input.includes('看见了')) {
    if (challengeContext) {
      const hours = calcLifeHours(challengeContext.amount, DEMO_HOURLY_RATE).toFixed(1);
      return getElephantPhrase('saw_it', lang, {
        amount: elephantMoney(challengeContext.amount),
        hours: elephantHours(hours, lang),
      });
    }
    // 防御路径 (demo 调用方保证有 context): 无金额时的通用语, 按语言给词避免混排
    return getElephantPhrase('saw_it', lang, elephantGenericVars(lang));
  }

  // User said they bought it → they decided TO buy
  // 🔧 Round 124 fix: 加 'chose to buy' / 'chose' 检测 — handleChooseToBuy 的 actionContent 是 "✗ Chose to buy"
  // 🔧 Round 125 fix: 加 '选择买' / '买' 检测 — 中文 actionContent 是 "✗ 选择买"
  if (input.includes('bought') || input.includes('buy it') || input.includes('ordered') || input.includes('chose to buy') || input.includes('chose') || input.includes('买了') || input.includes('选择买') || input.includes('下单')) {
    if (challengeContext) {
      const hours = calcLifeHours(challengeContext.amount, DEMO_HOURLY_RATE).toFixed(1);
      return getElephantPhrase('bought_anyway', lang, {
        amount: elephantMoney(challengeContext.amount),
        hours: elephantHours(hours, lang),
      });
    }
    return getElephantPhrase('bought_anyway', lang, elephantGenericVars(lang));
  }

  // 🔧 P0-5 fix: isFollowUp=true 时, 不走"item + price + hours"复读路径
  //   而是走 getChallengeFollowUpReply, 承认情绪 + 引导 sign up
  if (isFollowUp) {
    return getChallengeFollowUpReply(userInput, lang);
  }

  // First challenge reply — warmly present item + price + hours, invite a closer look
  if (challengeContext) {
    const hours = calcLifeHours(challengeContext.amount, DEMO_HOURLY_RATE).toFixed(1);
    return getElephantPhrase('first_reflection', lang, {
      item: challengeContext.itemName,
      amount: elephantMoney(challengeContext.amount),
      hours: elephantHours(hours, lang),
    });
  }

  // fallback to regular demo reply
  return getDemoReply(userInput, lang);
}
