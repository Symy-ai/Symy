import type { ProductCardData } from '@/types/product-card';

const SEARCH_TOOL_NAMES = new Set(['symy_search', 'mcp__symy-hands__symy_search']);

function isValidCard(value: unknown): value is ProductCardData {
  if (!value || typeof value !== 'object') return false;
  const card = value as Record<string, unknown>;
  return typeof card.product_ref === 'string' && card.product_ref.length > 0 &&
    typeof card.title === 'string' && typeof card.price_cents === 'number' &&
    typeof card.currency === 'string';
}

export function extractProductCards(toolName: string, content: string | null | undefined): ProductCardData[] {
  if (!SEARCH_TOOL_NAMES.has(toolName) || !content) return [];
  try {
    const parsed = JSON.parse(content) as {
      data?: { cards?: unknown };
    };
    const cards = parsed?.data?.cards;
    return Array.isArray(cards) ? cards.filter(isValidCard) : [];
  } catch {
    // safe to ignore: malformed tool payload degrades to no cards
    return [];
  }
}
