/**
 * websearch-wait-turn — symy_search 全网 fallback 等待话术 (batch72-a, 纯函数层)
 *
 * hands 侧给 symy_search 加 websearch fallback (货架没有 → 全网搜)。产品价值观:
 * 库里没有时不再推诿, 也不静默干等 — 先告诉用户「正在全网搜索、比较中」,
 * 结果卡片仍走既有 ProductCardData 渲染管道正常出卡。
 *
 * hands 契约 (防御式 — fallback 标记/卡片字段未上线 = 现状行为: 不等待话术):
 *   symy_search 的 tool return content JSON 可携带 (顶层或 data 内, 两处同判):
 *     - data_source: 'websearch' (字符串) 或含 'websearch' 的字符串数组
 *     - websearch_fallback: true (显式 fallback 标记, 二选一即可触发)
 *   卡片计数: SSE 结构化 cards 通道 (服务端已严格校验) 存在时以它为准,
 *   否则数 content 里 data.cards。cards < 2 且命中标记 → 触发等待话术。
 *
 * 话术本体在 i18n/messages/{zh,en}.json 的 chat.websearch.waiting
 * (服务端按 locale 直读字典, 同 cron push 路由的取词面)。
 */

import zhMessages from '@/i18n/messages/zh.json';
import enMessages from '@/i18n/messages/en.json';
import { SEARCH_TOOL_NAMES } from '@/lib/structured-cards';

export interface WebSearchWaitTurn {
  reply: string;
}

/** 货架单薄线: 结果卡少于这个数且走了 websearch fallback → 先发等待话术 */
const THIN_RESULT_CARD_COUNT = 2;

const MESSAGES: Record<'en' | 'zh', unknown> = { zh: zhMessages, en: enMessages };

/**
 * 构建全网搜索等待话术轮。query 会插入 {query} 占位符; 空搜索词保留无词形态。
 */
export function buildWebSearchWaitTurn(query: string, locale: 'en' | 'zh'): WebSearchWaitTurn {
  const dict = MESSAGES[locale] as { chat: { websearch: { waiting: string } } };
  const template = dict.chat.websearch.waiting;
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return {
      reply:
        locale === 'zh'
          ? '货架里没有合适的，小象正在全网搜索、比较中…🐘'
          : 'Nothing on the shelf fits — your elephant is searching the whole web and comparing for you… 🐘',
    };
  }
  return { reply: template.replace('{query}', trimmedQuery) };
}

/** websearch fallback 判定入参 — structuredCards 是 SSE 事件里的已校验卡片数组 */
export interface WebSearchFallbackInput {
  toolName: string;
  content: string | null | undefined;
  structuredCards?: unknown;
}

function markerHitsWebsearch(value: unknown): boolean {
  if (typeof value === 'string') return value.toLowerCase().includes('websearch');
  if (Array.isArray(value)) return value.some((v) => typeof v === 'string' && v.toLowerCase().includes('websearch'));
  return value === true;
}

/** data_source / websearch_fallback 顶层与 data 内两处都认 (hands 字段落点未定稿) */
function hasWebSearchMarker(payload: Record<string, unknown>): boolean {
  if (markerHitsWebsearch(payload.data_source) || markerHitsWebsearch(payload.websearch_fallback)) return true;
  const data = payload.data;
  if (!data || typeof data !== 'object') return false;
  const inner = data as Record<string, unknown>;
  return markerHitsWebsearch(inner.data_source) || markerHitsWebsearch(inner.websearch_fallback);
}

function resolveCardCount(payload: Record<string, unknown>, structuredCards: unknown): number {
  if (Array.isArray(structuredCards)) return structuredCards.length;
  const data = payload.data;
  if (data && typeof data === 'object' && Array.isArray((data as { cards?: unknown }).cards)) {
    return (data as { cards: unknown[] }).cards.length;
  }
  return 0;
}

/**
 * symy_search 工具结果是否触发全网搜索等待话术。
 * 防御式: 非搜索工具 / content 缺失或非法 JSON / 契约字段全缺 → false (现状行为)。
 * 纯函数: 只解析入参, 不读流不读库。
 */
export function isWebSearchFallbackResult(input: WebSearchFallbackInput): boolean {
  const { toolName, content, structuredCards } = input;
  if (!SEARCH_TOOL_NAMES.has(toolName) || !content) return false;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return false; // safe to ignore: malformed tool payload degrades to no wait turn
  }
  if (!parsed || typeof parsed !== 'object' || !hasWebSearchMarker(parsed)) return false;
  return resolveCardCount(parsed, structuredCards) < THIN_RESULT_CARD_COUNT;
}
