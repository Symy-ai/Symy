import { describe, expect, it } from 'vitest';

import { mapGachaError } from '../butterfly-error-mapping';

const t = (key: string, _opts?: { defaultValue?: string }) => `[${key}]`;

/**
 * butterfly-error-mapping.ts (121行) — gacha 错误映射 (Round 121 AUDIT-7)。
 *
 * 锁定:
 * - 空 → 双 null
 * - 优先级: 503 engine → 429 in-progress → 退款三族 → 通用 timeout →
 *   content (小写不区分) → chapter/session/network/rate → unknown
 * - 短错误码律 (WHATIF_*)
 */
describe('mapGachaError', () => {
  it('空 → 双 null', () => {
    expect(mapGachaError(null, t)).toEqual({ message: null, code: null });
    expect(mapGachaError(undefined, t)).toEqual({ message: null, code: null });
    expect(mapGachaError('', t)).toEqual({ message: null, code: null });
  });

  it('P1 优先映射: engine 预热+并发保护', () => {
    const a = mapGachaError('Story engine is not available. Please try again later.', t);
    expect(a).toEqual({ message: '[butterfly.errorEngineNotReady]', code: 'WHATIF_ENGINE_010' });
    const b = mapGachaError('Session creation already in progress. Please wait.', t);
    expect(b.code).toBe('WHATIF_INPROGRESS_011');
  });

  it('退款三族: timeout/parse/llm', () => {
    expect(mapGachaError('OUTLINE_TIMEOUT after 60s', t).code).toBe('WHATIF_TIMEOUT_002');
    expect(mapGachaError('OUTLINE_PARSE_FAILED', t).code).toBe('WHATIF_PARSE_008');
    expect(mapGachaError('OUTLINE_LLM_FAILED', t).code).toBe('WHATIF_AI_001');
  });

  it('Round 121: content 大小写不敏感 ("Content blocked" 命中)', () => {
    const r = mapGachaError('Content blocked by policy', t);
    expect(r.code).toBe('WHATIF_CONTENT_003');
    expect(r.message).toBe('[butterfly.contentError]');
  });

  it('chapter/session/network/rate 四族', () => {
    expect(mapGachaError('Chapter content could not be loaded', t).code).toBe('WHATIF_CHAPTER_004');
    expect(mapGachaError('Failed to create session', t).code).toBe('WHATIF_SESSION_005');
    expect(mapGachaError('Failed to fetch', t).code).toBe('WHATIF_NETWORK_006');
    expect(mapGachaError('429 Too Many requests', t).code).toBe('WHATIF_RATE_007');
  });

  it('unknown → 原文+WHATIF_UNKNOWN_000', () => {
    const r = mapGachaError('奇怪的未知错误', t);
    expect(r).toEqual({ message: '奇怪的未知错误', code: 'WHATIF_UNKNOWN_000' });
  });
});
