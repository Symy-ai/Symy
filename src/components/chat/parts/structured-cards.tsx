'use client';

// A1 「UI 组件即工具」渲染边界 (脑侧渲染层) — 模式移植自 anthropics/commerce-agents
// ("present tools" doctrine): 卡片是工具下发的结构化数据, 渲染层消费结构化载荷并在
// 边界上再做一次校验, 不解析模型正文里的任何自绘标记。
// Copyright 2026 Anthropic PBC. SPDX-License-Identifier: Apache-2.0 (模式借鉴).
//
// 过渡期双轨:
//   新轨 — message.productCards 来自结构化通道 (SSE tool_result.cards → 严格校验)。
//   旧轨 — consume-ai-stream 的 extractProductCards 字符串解析保留作 fallback
//         (见 consume-ai-stream.ts)。本组件对最终进渲染层的数组兜底复检,
//         旧轨数据混入坏卡时在此被拦截, ProductCards 视觉行为不变。

import { ProductCards } from './product-cards';
import { parseStructuredCards } from '@/lib/structured-cards';
import type { ProductCardData } from '@/types/product-card';

/**
 * 渲染边界复检: 即便上游 (旧轨字符串解析/历史会话恢复) 放进了未校验的数组,
 * 到达 DOM 前仍以本模块 schema 为准逐卡过滤。全无效 → 不渲染 (与无卡片一致)。
 */
export function StructuredProductCards({ cards, query }: { cards: ProductCardData[] | undefined; query?: string }) {
  if (!cards?.length) return null;
  const valid = parseStructuredCards({ cards });
  if (!valid.length) return null;
  return <ProductCards cards={valid} query={query} />;
}
