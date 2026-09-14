/**
 * list-triage-turn — 购物清单批量分诊轮 (服务端 part, batch57-a)
 *
 * 用户消息命中 list-triage-detector ("周末要买这些：洗衣液、跑鞋、礼物、
 * 键盘") 时, 不调 Letta (一张清单需要的是逐条分诊结构, 不是泛泛安利),
 * 直接返回 canned 迎接回复 + 清单分诊卡:
 *   - 迎接话术取 elephant-tone 的 list_triage_welcome 场景 ("帮我把关
 *     整张购物清单" 的绿色搭子)
 *   - 分诊卡 payload = 逐条三态判定: 词条命中 → 替代 (只读引用 green-alt
 *     词条 why/alternative); 守护品类无词条 → 想清楚; 其余含 53-b
 *     guard-scope exempt 品类 → 绿灯静默放行 (不绿说教)
 *
 * 与 compare-turn 同路数: 命中即 canned reply 短路返回。互斥: 反驳 /
 * 求问 / 承诺 / 对比四流更强 (detector 内排除 + route 链序在后)。
 */

import { detectListTriage } from './list-triage-detector';
import { suggestAlternative } from '@/lib/green-alternatives';
import { getElephantPhrase } from '@/lib/elephant-tone';
import { resolveGuardCategory } from '@/lib/guard-category-insight';
import { isCategoryExempt, isGuardScopeCategory, type GuardScope } from '@/lib/guard-scope';
import type { ListTriageCardData, ListTriageItem } from '@/types/list-triage';

export interface ListTriageTurn {
  reply: string;
  listTriageCard: ListTriageCardData;
}

export interface BuildListTriageTurnInput {
  userContent: string;
  locale: 'en' | 'zh';
  /** 53-b 守护范围三态 — exempt 品类条目静默放行 (绿灯, 不说教) */
  guardScope: GuardScope;
  /** 测试可注入 rng, 让话术轮换确定 */
  rng?: () => number;
}

/** 单条目的三态判定: exempt 静默放行 > 词条命中替代 > 守护品类想清楚 > 绿灯 */
function triageItem(word: string, locale: 'en' | 'zh', guardScope: GuardScope): ListTriageItem {
  const category = resolveGuardCategory({ itemTitle: word });

  // 53-b exempt 语义: 不追问不给替代, 直接放行 (检测仍落账, 卡面不啰嗦)
  if (category !== 'other' && isGuardScopeCategory(category) && isCategoryExempt(guardScope, category)) {
    return { word, verdict: 'green', altId: null, why: null, alternative: null, category };
  }

  const hit = suggestAlternative(word, locale);
  if (hit) {
    return { word, verdict: 'alt', altId: hit.id, why: hit.why, alternative: hit.alternative, category };
  }

  if (category !== 'other') {
    return { word, verdict: 'think', altId: null, why: null, alternative: null, category };
  }
  return { word, verdict: 'green', altId: null, why: null, alternative: null, category };
}

/**
 * 命中清单轮时返回 {reply, listTriageCard}, 否则 null。
 * 纯函数: 检测 + 词条查表 + 品类解析, 不读库不调外部服务。
 */
export function buildListTriageTurn(input: BuildListTriageTurnInput): ListTriageTurn | null {
  const { userContent, locale, guardScope, rng } = input;
  const intent = detectListTriage(userContent);
  if (!intent) return null;

  const items = intent.items.map((word) => triageItem(word, locale, guardScope));
  const summary = {
    total: items.length,
    green: items.filter((i) => i.verdict === 'green').length,
    alt: items.filter((i) => i.verdict === 'alt').length,
    think: items.filter((i) => i.verdict === 'think').length,
  };

  return {
    reply: getElephantPhrase('list_triage_welcome', locale, undefined, rng),
    listTriageCard: { items, summary },
  };
}

/** list_triage_card SSE 事件的 payload 形状 (consume-ai-stream 按 type 分发) */
export interface ListTriageSseEvent {
  type: 'list_triage_card';
  listTriageCard: ListTriageCardData;
}

export function listTriageSseEvent(card: ListTriageCardData): ListTriageSseEvent {
  return { type: 'list_triage_card', listTriageCard: card };
}

/**
 * 清单轮的 canned SSE 流: 先发分诊卡事件 (卡片先渲染), 再分块发迎接回复
 * (模拟 typing), 最后 done。与 compare canned stream 同构。
 */
export function buildListTriageSseStream(turn: ListTriageTurn): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = turn.reply.match(/.{1,15}/g) || [turn.reply];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(listTriageSseEvent(turn.listTriageCard))}\n\n`),
      );
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`));
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      controller.close();
    },
  });
}
