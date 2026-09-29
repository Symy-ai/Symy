// 第23刀，自 route.ts:468-496 纯机械搬移
// （SSE 包装栈 — 字节序核心。"谁后包装谁更靠前": 源码调用序 = 事件字节序。
//   纯函数: 给定 innerStream + 审计入参 + 卡片集合 → 产包装完成的 sseBody,
//   不真连 Letta (streamToAgent 由调用方 letta-dispatch 负责)。）
import { buildWebSearchWaitTurn } from '@/lib/websearch-wait-turn';
import { withWebSearchWaitEvent } from './websearch-wait-stream';
import { wrapStreamWithAudit } from './stream-audit';
import { prependReuseHintEvent, reuseHintSseEvent } from './reuse-detect';
import type { ReuseHint } from '@/lib/reuse-advisor';
import { withGreenAltEvent } from './green-alt-detect';
import { withGreenKnowledgeEvent, type GreenKnowledgeInjection } from './green-knowledge-context';
import { withAltFootprintEvent } from './alt-adoption-context';
import { microChallengeSseEvent } from './micro-challenge-detector';
import type { GreenAltCardData } from '@/types/green-alt-card';
import type { AltFootprintCardData } from '@/types/alt-footprint';
import type { MicroChallengeProposal } from '@/types/micro-challenge';
import { type ChallengeContext } from './types';

export interface SsePipelineInput {
  /** Letta 原生流 (streamToAgent 产物) */
  innerStream: ReadableStream<Uint8Array>;
  userContent: string;
  userId: string | undefined;
  locale: 'en' | 'zh';
  impulseContext: { platform?: string; amount?: number; reasons?: string[]; time?: string } | undefined;
  validChallengeContext: ChallengeContext | undefined;
  targetAgentId: string;
  // 卡片集合 (loadLettaTurnContext 产物; 未命中为 null → 对应包装直通)
  greenAltCard: GreenAltCardData | null;
  reuseHint: ReuseHint | null;
  microChallenge: MicroChallengeProposal | null;
  greenKnowledge: GreenKnowledgeInjection;
  altFootprintCard: AltFootprintCardData | null;
}

/**
 * 包装链 (顺序 = SSE 事件字节序, 一层不许动):
 *   innerStream
 *   → wrapStreamWithAudit            (审计, 最内层)
 *   → withWebSearchWaitEvent         (全网搜索等待话术, canned 词不计入审计 aiOutput)
 *   → [reuseHint] prependReuseHintEvent
 *   → withGreenAltEvent              (null 直通)
 *   → withGreenKnowledgeEvent        (null 直通)
 *   → withAltFootprintEvent          (null 直通)
 *   → [microChallenge] prependReuseHintEvent  (最先包装 → 排最后)
 */
export function buildSsePipeline(input: SsePipelineInput): ReadableStream<Uint8Array> {
  const { innerStream, userContent, userId, locale, impulseContext, validChallengeContext, targetAgentId, greenAltCard, reuseHint, microChallenge, greenKnowledge, altFootprintCard } = input;
  // 🛡️ V2: Use challenge-aware compensation wrapper
  const monitoredStream = wrapStreamWithAudit(innerStream, userContent, userId, impulseContext, validChallengeContext, targetAgentId);
  // 🌐 batch72-a: 包在审计 wrapper 之外 (canned 词不计入 aiOutput)、预注入包装之内。
  //    fallback 契约未命中时原流直通；i18n key 由构建函数强制存在。
  //    非流式路径不接 (等待话术是 SSE 流式体验, 非流式保持现状)。
  const webSearchWaitStream = withWebSearchWaitEvent(monitoredStream, buildWebSearchWaitTurn(userContent, locale));
  // 🔁 复用优先: reuse_hint 预注入 (guard-off/未命中 → 原流直通, 与 green 侧零包装对称)
  let sseBody = reuseHint
    ? prependReuseHintEvent(webSearchWaitStream, reuseHintSseEvent(reuseHint))
    : webSearchWaitStream;
  // 🌱 绿色替代命中时在最前面注入 green_alt 事件 (谁后包装谁更靠前 → green_alt 排 reuse_hint 前)
  sseBody = withGreenAltEvent(sseBody, greenAltCard);
  // 📖 batch47-a 知识问答: 命中时注入 green_knowledge 事件 (最晚包装 → 排最前, chip 展示在卡片区顶部)
  sseBody = withGreenKnowledgeEvent(sseBody, greenKnowledge.card);
  // 🐘 batch55-c 替代足迹: 命中时注入 alt_footprint 事件 (最晚包装 → 排最前, 足迹卡展示在卡片区顶部)
  sseBody = withAltFootprintEvent(sseBody, altFootprintCard);
  // 🐞 batch46-b: 微挑战预注入 (最先包装 → 排最后, 与卡片渲染顺序 green → reuse → micro 一致)
  if (microChallenge) {
    sseBody = prependReuseHintEvent(sseBody, microChallengeSseEvent(microChallenge));
  }
  return sseBody;
}
