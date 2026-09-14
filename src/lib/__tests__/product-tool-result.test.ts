import { describe, expect, it } from 'vitest';
import { extractProductCards } from '../product-tool-result';

const result = JSON.stringify({
  trace_id: 'trace-1',
  ok: true,
  data: { cards: [{ product_ref: 'p1', title: 'Liquor', price_cents: 32800, currency: 'CNY' }], total_hits: 1 },
});

describe('extractProductCards', () => {
  it('extracts cards from symy_search', () => {
    expect(extractProductCards('symy_search', result)).toHaveLength(1);
  });

  it('supports the MCP-qualified tool name', () => {
    expect(extractProductCards('mcp__symy-hands__symy_search', result)).toHaveLength(1);
  });

  it('ignores other tools', () => {
    expect(extractProductCards('record_impulse', result)).toHaveLength(0);
  });

  it('ignores malformed JSON', () => {
    expect(extractProductCards('symy_search', '{bad')).toHaveLength(0);
  });
});
