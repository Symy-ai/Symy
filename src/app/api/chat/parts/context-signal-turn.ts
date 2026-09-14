/**
 * context-signal-turn — 购物场景弱信号路由轮 (服务端 part, batch61-b)
 *
 * 弱信号检测命中 (shopping-context-intent) 且置信度过线时, 不调 Letta, 按
 * 信号语义路由到既有能力 (全部复用, 零新流程零新统计口径):
 *   - emotion_reward → 60-c 情绪守护卡 (EmotionGuardCardData, 同 payload 同话术
 *     场景, 只进入既有情绪卡, 不新建任何心理评估)
 *   - scarcity_promo → 48-b 冷静卡 (CooldownCardData, 愿望单 + 次日一问的既有
 *     动作; 话术取 promo_pressure_welcome — 拆话术不拆人)
 *   - wear_replace   → 50-a 买前三问卡 (PrepurchaseCardData); 点名品类在
 *     green-alternatives 词表内时 detector 层整体让路 (null) — 耗损×绿色品类
 *     由既有绿色替代流继续负责, 本层绝不吞 (即"绿色替代"复用路径)
 *
 * 与 cooldown/prepurchase 同路数: 命中即 canned reply 短路返回。识别到的信号词
 * 随 context_signal 事件/字段一并下发 (SSE / 非流式 JSON / chat 气泡三路一致),
 * 用户可纠正 — dismissedEntryIds 透传 detector, 一次纠正本会话不再重复同信号。
 *
 * 链序红线: 本块排在 60-c 情绪守护等强 detector 之后、loadLettaTurnContext
 * (BNPL/green/reuse/micro 通用购买预检) 之前, 链序由测试锁定; 数据问句/明确
 * 购物意图/纯闲聊在 detector 层已让路, 绝不吞。
 */

import {
  CONTEXT_SIGNAL_TRIGGER_THRESHOLD,
  detectShoppingContextIntent,
} from '@/lib/shopping-context-intent';
import { getElephantPhrase } from '@/lib/elephant-tone';
import { normalizeGuardIntensity } from '@/lib/guard-intensity';
import { normalizeInterceptCategory } from '@/features/butterfly/green-alt-copy';
import type { EmotionGuardCardData } from '@/types/emotion-guard';
import type { CooldownCardData } from '@/types/cooldown';
import type { PrepurchaseCardData } from '@/types/prepurchase';
import type { ContextSignalData } from '@/types/context-signal';
import { buildTrustEvidence, type ContextTrustInput, type TrustEvidence } from '@/lib/context-trust';

export interface ContextSignalTurn {
  reply: string;
  contextSignal: ContextSignalData;
  contextTrust?: TrustEvidence;
  /** emotion_reward → 60-c 既有情绪卡 */
  emotionGuardCard?: EmotionGuardCardData;
  /** scarcity_promo → 48-b 既有冷静卡 (category 识别不出为 null) */
  cooldownCard?: CooldownCardData;
  /** wear_replace → 50-a 既有三问卡 */
  prepurchaseCard?: PrepurchaseCardData;
}

export interface BuildContextSignalTurnInput {
  userContent: string;
  locale: 'en' | 'zh';
  /** 守护强度三档 (emotion 卡档位归一用, 缺失/损坏 → balanced) */
  guardIntensity?: unknown;
  /** 绿色守护开关 — 透传 detector: 'off' 时调用方 (route) 已整体静默, 绿色品类也让路 */
  greenPref?: 'on' | 'off';
  /** 会话内已被用户纠正的词条 id (body.dismissedContextSignals 透传) */
  dismissedEntryIds?: readonly string[];
  /** 测试可注入 rng, 让话术轮换确定 */
  rng?: () => number;
  /** Existing shopping facts; only evidence relevant to this turn is returned. */
  facts?: ContextTrustInput['facts'];
  /** Existing behavioral history; descriptions are already privacy-safe labels. */
  history?: ContextTrustInput['history'];
  /** Most recent correction supplied by the existing audit path. */
  correction?: ContextTrustInput['correction'];
  now?: Date;
}

/**
 * 命中弱信号路由轮时返回 {reply, contextSignal, ...复用卡}, 否则 null。
 * 纯函数: 检测 + 取词, 不读库不调外部服务。低置信 (weak 档) 不触发 → null。
 */
export function buildContextSignalTurn(input: BuildContextSignalTurnInput): ContextSignalTurn | null {
  const { userContent, locale, guardIntensity, greenPref, dismissedEntryIds, rng, facts, history, correction, now } = input;
  const detection = detectShoppingContextIntent(userContent, { locale, greenPref, dismissedEntryIds });
  if (!detection) return null;
  // 低置信不触发 — 交还既有 chat 流程 (Letta 自由回复)
  if (detection.confidence < CONTEXT_SIGNAL_TRIGGER_THRESHOLD) return null;

  const contextSignal: ContextSignalData = {
    signal: detection.signal,
    words: detection.entries.map((entry) => ({ id: entry.id, zh: entry.wordZh, en: entry.wordEn })),
  };
  const contextTrust = buildTrustEvidence({
    signal: contextSignal.signal,
    words: contextSignal.words,
    facts,
    history,
    correction,
    now,
  }) ?? undefined;

  if (detection.signal === 'emotion_reward') {
    return {
      reply: getElephantPhrase('emotion_guard_welcome', locale, undefined, rng),
      contextSignal,
      contextTrust,
      emotionGuardCard: {
        mood: detection.mood ?? 'celebratory',
        intensity: normalizeGuardIntensity(guardIntensity),
      },
    };
  }

  if (detection.signal === 'scarcity_promo') {
    const category = normalizeInterceptCategory(userContent);
    return {
      reply: getElephantPhrase('promo_pressure_welcome', locale, undefined, rng),
      contextSignal,
      contextTrust,
      cooldownCard: { category: category === 'default' ? null : category },
    };
  }

  // wear_replace — 三问 (绿色品类已在 detector 层让路给既有绿色替代流)
  return {
    reply: getElephantPhrase('prepurchase_welcome', locale, undefined, rng),
    contextSignal,
    contextTrust,
    prepurchaseCard: { subject: null },
  };
}

/** context_signal SSE 事件的 payload 形状 (consume-ai-stream 按 type 分发) */
export interface ContextSignalSseEvent {
  type: 'context_signal';
  contextSignal: ContextSignalData;
}

export function contextSignalSseEvent(data: ContextSignalData): ContextSignalSseEvent {
  return { type: 'context_signal', contextSignal: data };
}

export interface ContextTrustSseEvent {
  type: 'context_trust';
  contextTrust: TrustEvidence;
}

export function contextTrustSseEvent(data: TrustEvidence): ContextTrustSseEvent {
  return { type: 'context_trust', contextTrust: data };
}

/**
 * 弱信号轮的 canned SSE 流: 先发信号词事件 (chips 先渲染, 用户可纠正), 再发
 * 路由卡事件, 再分块发 canned 回复 (模拟 typing), 最后 done。
 * 卡事件 payload 复用既有 turn 的 SSE 事件形状 (emotion_guard_card / cooldown_card /
 * prepurchase_card), 前端既有分发零改动。
 */
export function buildContextSignalSseStream(turn: ContextSignalTurn): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = turn.reply.match(/.{1,15}/g) || [turn.reply];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(contextSignalSseEvent(turn.contextSignal))}\n\n`),
      );
      if (turn.contextTrust) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(contextTrustSseEvent(turn.contextTrust))}\n\n`),
        );
      }
      if (turn.emotionGuardCard) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'emotion_guard_card', emotionGuardCard: turn.emotionGuardCard })}\n\n`,
          ),
        );
      }
      if (turn.cooldownCard) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'cooldown_card', cooldownCard: turn.cooldownCard })}\n\n`,
          ),
        );
      }
      if (turn.prepurchaseCard) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'prepurchase_card', prepurchaseCard: turn.prepurchaseCard })}\n\n`,
          ),
        );
      }
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`));
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      controller.close();
    },
  });
}
