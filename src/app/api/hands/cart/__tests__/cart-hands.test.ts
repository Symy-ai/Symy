import { describe, expect, it } from 'vitest';
import {
  buildCartToolCall,
  currencyForLang,
  langFromRequest,
  sessionRefFor,
  unwrapCartEnvelope,
} from '../cart-hands';

describe('symy_cart arguments assembly (真契约)', () => {
  it('uses the single symy_cart tool with action + context (not symy_cart_{action})', () => {
    const call = buildCartToolCall('list', {
      userRef: 'u-1234567890',
      sessionRef: 'web-u-12345',
      lang: 'zh',
      currency: 'CNY',
    });
    expect(call.name).toBe('symy_cart');
    expect(call.arguments).toMatchObject({
      action: 'list',
      context: {
        user_ref: 'u-1234567890',
        session_ref: 'web-u-12345',
        lang: 'zh',
        currency: 'CNY',
      },
    });
    expect(call.arguments.item).toBeUndefined();
  });

  it('passes item as a top-level arguments field (remove = qty 0)', () => {
    const call = buildCartToolCall('remove', {
      userRef: 'u-1',
      sessionRef: 'web-u-1',
      lang: 'en',
      currency: 'USD',
    }, { product_ref: 'p9', qty: 0 });
    expect(call.arguments.item).toEqual({ product_ref: 'p9', qty: 0 });
    expect((call.arguments.context as Record<string, unknown>).item).toBeUndefined();
  });

  it('derives a stable web- session_ref from the first 8 chars of user id', () => {
    expect(sessionRefFor('a1b2c3d4e5f6')).toBe('web-a1b2c3d4');
  });

  it('detects lang from NEXT_LOCALE cookie, then Accept-Language, defaulting to en', () => {
    expect(langFromRequest('other=1; NEXT_LOCALE=zh-CN', null)).toBe('zh');
    expect(langFromRequest('NEXT_LOCALE=en', null)).toBe('en');
    expect(langFromRequest(null, 'zh-CN,zh;q=0.9,en;q=0.8')).toBe('zh');
    expect(langFromRequest(null, 'en-US,en;q=0.9')).toBe('en');
    expect(langFromRequest(null, null)).toBe('en');
  });

  it('maps zh→CNY and en→USD', () => {
    expect(currencyForLang('zh')).toBe('CNY');
    expect(currencyForLang('en')).toBe('USD');
  });
});

describe('MCP envelope unwrap', () => {
  const envelopeFor = (inner: Record<string, unknown>) =>
    JSON.stringify({
      jsonrpc: '2.0',
      id: 'req-1',
      result: {
        content: [{ type: 'text', text: JSON.stringify({ trace_id: 't-1', ...inner }) }],
      },
    });

  it('unwraps result.content[0].text into { ok, data }', () => {
    const out = unwrapCartEnvelope(envelopeFor({ ok: true, data: { cart_lines: [], cart_total_cents: 0 } }));
    expect(out).toEqual({ ok: true, data: { cart_lines: [], cart_total_cents: 0 } });
  });

  it('surfaces the business error without throwing', () => {
    const out = unwrapCartEnvelope(envelopeFor({ ok: false, error: 'cart not found' }));
    expect(out).toEqual({ ok: false, error: 'cart not found' });
  });

  it('parses SSE-formatted envelopes (data: lines)', () => {
    const inner = { trace_id: 't-2', ok: true, data: { cart_lines: [{ product_ref: 'p1' }], cart_total_cents: 100 } };
    const sse = `event: message\ndata: ${JSON.stringify({
      jsonrpc: '2.0',
      id: 'req-2',
      result: { content: [{ type: 'text', text: JSON.stringify(inner) }] },
    })}\n\n`;
    const out = unwrapCartEnvelope(sse);
    expect(out.ok).toBe(true);
    expect(out.data).toEqual({ cart_lines: [{ product_ref: 'p1' }], cart_total_cents: 100 });
  });

  it('maps JSON-RPC protocol errors to ok:false', () => {
    const out = unwrapCartEnvelope(JSON.stringify({
      jsonrpc: '2.0',
      id: 'req-3',
      error: { code: -32602, message: 'Invalid params' },
    }));
    expect(out.ok).toBe(false);
    expect(out.error).toBe('Invalid params');
  });

  it('maps result.isError to ok:false', () => {
    const out = unwrapCartEnvelope(JSON.stringify({
      jsonrpc: '2.0',
      id: 'req-4',
      result: { isError: true, content: [{ type: 'text', text: 'tool blew up' }] },
    }));
    expect(out).toEqual({ ok: false, error: 'tool blew up' });
  });

  it('never throws on garbage — returns ok:false with an error string', () => {
    for (const garbage of ['', 'not json at all', 'data: [DONE]']) {
      const out = unwrapCartEnvelope(garbage);
      expect(out.ok).toBe(false);
      expect(typeof out.error).toBe('string');
    }
  });
});
