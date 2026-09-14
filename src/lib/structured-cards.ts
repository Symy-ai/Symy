// Structured product-card schema + strict validation.
// Pattern ported from anthropics/commerce-agents ("UI components as tools" /
// present-tool doctrine, docs/safety.md): product cards are server-assembled
// structured data that the brain may reference but never rewrite, and the
// rendering layer validates the shape again at the boundary instead of trusting
// model-adjacent text.
// Copyright 2026 Anthropic PBC. SPDX-License-Identifier: Apache-2.0 (模式借鉴).
//
// 双轨过渡 (A1 移植, 2026-09-07):
//   新轨 — hands 的 symy_search 结构化 cards 字段经本模块严格校验后直通渲染层;
//   旧轨 — src/lib/product-tool-result.ts 的字符串 JSON 解析保留作 fallback,
//         两者校验强度对齐前旧轨仍是信任边界上的弱校验, 故本模块是权威。

import type { ProductCardData } from '@/types/product-card';
import { sanitizeLabel } from '@/lib/fencing';

/** symy_search 的两个名字: 直连名 + Letta MCP server 前缀名 (与 product-tool-result 对齐) */
export const SEARCH_TOOL_NAMES = new Set(['symy_search', 'mcp__symy-hands__symy_search']);

/** 卡片数量硬顶: UI 是 2-3 列网格, 超出部分是工具返回噪声, 直接丢弃 */
export const MAX_STRUCTURED_CARDS = 12;

const MAX_REF_CHARS = 128;
const MAX_TITLE_CHARS = 200;
const MAX_URL_CHARS = 2048;
const MAX_PRICE_CENTS = 100_000_000_000; // 10 亿级金额上限, 拒绝明显异常的数量级
const MAX_COMPLIANCE_TAGS = 8;

const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
const CURRENCY_PATTERN = /^[A-Za-z]{3}$/;

function isNonEmptyBoundedString(value: unknown, maxChars: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxChars;
}

function isSafeCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_PRICE_CENTS;
}

/** 只接受 http(s) 绝对链接 — 挡 javascript:/data:/协议相对等渲染面注入。 */
function sanitizeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > MAX_URL_CHARS) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : undefined;
  } catch {
    // safe to ignore: 非法 URL 按无链接处理 — 丢可选字段即可, 不值得中断渲染
    return undefined;
  }
}

function validateCard(value: unknown): ProductCardData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const card = value as Record<string, unknown>;

  // 必填四元组: 任一缺失/形态非法 → 整卡丢弃 (price/currency 缺了卡片无法成立)
  if (!isNonEmptyBoundedString(card.product_ref, MAX_REF_CHARS)) return null;
  // ref 是回传 symy_cart 的协议值: 空白 (含 \n\r\t) 与控制字符都拒绝, 注入载荷进不来
  if (/\s/.test(card.product_ref) || CONTROL_CHARS.test(card.product_ref)) return null;
  if (!isSafeCents(card.price_cents)) return null;
  if (typeof card.currency !== 'string' || !CURRENCY_PATTERN.test(card.currency)) return null;
  const title = sanitizeLabel(card.title, MAX_TITLE_CHARS);
  if (!title) return null;

  // 可选字段: 单字段非法只丢字段, 不丢整卡 (渲染层全部按可选处理)
  const compliance = Array.isArray(card.compliance)
    ? card.compliance
        .filter((tag): tag is string => isNonEmptyBoundedString(tag, 32))
        .slice(0, MAX_COMPLIANCE_TAGS)
    : undefined;

  return {
    product_ref: card.product_ref,
    title,
    price_cents: card.price_cents,
    unit_price_cents: isSafeCents(card.unit_price_cents) ? card.unit_price_cents : undefined,
    unit_label: isNonEmptyBoundedString(card.unit_label, 40) ? card.unit_label : undefined,
    currency: card.currency.toUpperCase(),
    category: isNonEmptyBoundedString(card.category, 64) ? card.category : undefined,
    subcategory: isNonEmptyBoundedString(card.subcategory, 64) ? card.subcategory : undefined,
    image_url: sanitizeHttpUrl(card.image_url),
    source: isNonEmptyBoundedString(card.source, 64) ? card.source : undefined,
    marketplace_url: sanitizeHttpUrl(card.marketplace_url),
    in_stock: typeof card.in_stock === 'boolean' ? card.in_stock : undefined,
    compliance: compliance && compliance.length ? compliance : undefined,
    price_cents_display: isNonEmptyBoundedString(card.price_cents_display, 32)
      ? card.price_cents_display
      : undefined,
    unit_price_cents_display: isNonEmptyBoundedString(card.unit_price_cents_display, 32)
      ? card.unit_price_cents_display
      : undefined,
  };
}

/**
 * 校验 + 规范化结构化卡片载荷。接受三种形态 (都是 executor 侧已反序列化的对象,
 * 不是模型文本): hands 原始信封 {data:{cards}}, SSE 结构化通道 {cards}, 裸数组。
 * 逐卡校验, 坏卡丢弃不抬高整体失败; product_ref 去重保序 (先到先得), 数量硬顶。
 */
export function parseStructuredCards(source: unknown): ProductCardData[] {
  let rawCards: unknown;
  if (Array.isArray(source)) rawCards = source;
  else if (source && typeof source === 'object') {
    const envelope = source as { cards?: unknown; data?: { cards?: unknown } };
    rawCards = Array.isArray(envelope.cards) ? envelope.cards : envelope.data?.cards;
  }
  if (!Array.isArray(rawCards)) return [];

  const seen = new Set<string>();
  const out: ProductCardData[] = [];
  for (const raw of rawCards) {
    if (out.length >= MAX_STRUCTURED_CARDS) break;
    const card = validateCard(raw);
    if (!card || seen.has(card.product_ref)) continue;
    seen.add(card.product_ref);
    out.push(card);
  }
  return out;
}

/**
 * 服务端辅助 (letta.ts SSE): 对搜索工具的 tool_return content 做"只解析一次"——
 * 在 executor 侧把字符串转成结构化对象并过严格校验, 干净数组挂在 SSE 事件的
 * cards 字段上下发。解析失败/非搜索工具 → 空数组 (调用方省略该字段, 走旧轨 fallback)。
 */
export function extractSearchCardsFromContent(toolName: string, content: string | null | undefined): ProductCardData[] {
  if (!SEARCH_TOOL_NAMES.has(toolName) || !content) return [];
  try {
    return parseStructuredCards(JSON.parse(content));
  } catch {
    // safe to ignore: 非法载荷 → 无结构化通道, 客户端走旧字符串解析 fallback
    return [];
  }
}
