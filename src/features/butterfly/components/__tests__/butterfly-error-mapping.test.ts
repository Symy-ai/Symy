/**
 * butterfly-error-mapping Tests — Round 121 audit fix (AUDIT-7 Step 1)
 *
 * 🔧 提取自 butterfly-tab.tsx 的 errorP/errorCodeP IIFE
 * 此测试覆盖所有错误类别 + edge cases
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapGachaError } from '../tab/butterfly-error-mapping';

// Mock t function — returns defaultValue (simulates i18n behavior)
const mockT = vi.fn((key: string, values?: { defaultValue?: string }) => {
  return values?.defaultValue || key;
});

describe('mapGachaError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null/null for null error', () => {
    const result = mapGachaError(null, mockT);
    expect(result.message).toBeNull();
    expect(result.code).toBeNull();
  });

  it('returns null/null for undefined error', () => {
    const result = mapGachaError(undefined, mockT);
    expect(result.message).toBeNull();
    expect(result.code).toBeNull();
  });

  it('returns null/null for empty string error', () => {
    const result = mapGachaError('', mockT);
    expect(result.message).toBeNull();
    expect(result.code).toBeNull();
  });

  it('maps OUTLINE_TIMEOUT to timeout error + WHATIF_TIMEOUT_002', () => {
    const result = mapGachaError('OUTLINE_TIMEOUT: story generation exceeded 60s', mockT);
    expect(result.code).toBe('WHATIF_TIMEOUT_002');
    expect(result.message).toContain('timed out');
  });

  it('maps "timed out" to timeout error + WHATIF_TIMEOUT_002', () => {
    const result = mapGachaError('Story generation timed out', mockT);
    expect(result.code).toBe('WHATIF_TIMEOUT_002');
  });

  it('maps "Your pull was refunded" to timeout error + WHATIF_TIMEOUT_002', () => {
    const result = mapGachaError('Your pull was refunded due to timeout', mockT);
    expect(result.code).toBe('WHATIF_TIMEOUT_002');
  });

  it('maps OUTLINE_PARSE_FAILED to parse error + WHATIF_PARSE_008', () => {
    const result = mapGachaError('OUTLINE_PARSE_FAILED: unexpected response', mockT);
    expect(result.code).toBe('WHATIF_PARSE_008');
    expect(result.message).toContain('unexpected response');
  });

  it('maps "unexpected response" to parse error + WHATIF_PARSE_008', () => {
    const result = mapGachaError('AI returned unexpected response', mockT);
    expect(result.code).toBe('WHATIF_PARSE_008');
  });

  it('maps OUTLINE_LLM_FAILED to LLM error + WHATIF_AI_001', () => {
    const result = mapGachaError('OUTLINE_LLM_FAILED: service temporarily unavailable', mockT);
    expect(result.code).toBe('WHATIF_AI_001');
    expect(result.message).toContain('temporarily unavailable');
  });

  it('maps "temporarily unavailable" to LLM error + WHATIF_AI_001', () => {
    const result = mapGachaError('AI service is temporarily unavailable', mockT);
    expect(result.code).toBe('WHATIF_AI_001');
  });

  it('maps "Failed to generate story outline" to AI error + WHATIF_AI_001', () => {
    const result = mapGachaError('Failed to generate story outline', mockT);
    expect(result.code).toBe('WHATIF_AI_001');
  });

  it('maps "Story engine" to AI error + WHATIF_AI_001', () => {
    const result = mapGachaError('Story engine error', mockT);
    expect(result.code).toBe('WHATIF_AI_001');
  });

  it('maps "timeout" (lowercase) to timeout error + WHATIF_TIMEOUT_002', () => {
    const result = mapGachaError('Request timeout after 60s elapsed', mockT);
    expect(result.code).toBe('WHATIF_TIMEOUT_002');
  });

  it('maps content moderation errors to content error + WHATIF_CONTENT_003', () => {
    const result = mapGachaError('Content blocked by moderation filter (policy violation)', mockT);
    expect(result.code).toBe('WHATIF_CONTENT_003');
    expect(result.message).toContain("couldn't be processed");
  });

  it('maps "Chapter content could not be loaded" to chapter error + WHATIF_CHAPTER_004', () => {
    const result = mapGachaError('Chapter content could not be loaded', mockT);
    expect(result.code).toBe('WHATIF_CHAPTER_004');
  });

  it('maps "chapter_start missed" to chapter error + WHATIF_CHAPTER_004', () => {
    const result = mapGachaError('chapter_start missed', mockT);
    expect(result.code).toBe('WHATIF_CHAPTER_004');
  });

  it('maps "Failed to create session" to session error + WHATIF_SESSION_005', () => {
    const result = mapGachaError('Failed to create session', mockT);
    expect(result.code).toBe('WHATIF_SESSION_005');
  });

  it('maps "Failed to create story session" to session error + WHATIF_SESSION_005', () => {
    const result = mapGachaError('Failed to create story session', mockT);
    expect(result.code).toBe('WHATIF_SESSION_005');
  });

  it('maps "Network" to network error + WHATIF_NETWORK_006', () => {
    const result = mapGachaError('Network error: connection refused', mockT);
    expect(result.code).toBe('WHATIF_NETWORK_006');
  });

  it('maps "Failed to fetch" to network error + WHATIF_NETWORK_006', () => {
    const result = mapGachaError('Failed to fetch from API', mockT);
    expect(result.code).toBe('WHATIF_NETWORK_006');
  });

  it('maps "429" to rate limit error + WHATIF_RATE_007', () => {
    const result = mapGachaError('429 Too Many Requests', mockT);
    expect(result.code).toBe('WHATIF_RATE_007');
  });

  it('maps "Too Many" to rate limit error + WHATIF_RATE_007', () => {
    const result = mapGachaError('Too Many Requests', mockT);
    expect(result.code).toBe('WHATIF_RATE_007');
  });

  it('maps "rate limit" to rate limit error + WHATIF_RATE_007', () => {
    const result = mapGachaError('rate limit exceeded', mockT);
    expect(result.code).toBe('WHATIF_RATE_007');
  });

  it('maps unknown error to raw message + WHATIF_UNKNOWN_000', () => {
    const result = mapGachaError('Some completely unknown error type', mockT);
    expect(result.code).toBe('WHATIF_UNKNOWN_000');
    expect(result.message).toBe('Some completely unknown error type');
  });

  it('calls t() with correct i18n keys for each error category', () => {
    mapGachaError('OUTLINE_TIMEOUT', mockT);
    expect(mockT).toHaveBeenCalledWith('butterfly.outlineTimeoutError', expect.any(Object));

    vi.clearAllMocks();
    mapGachaError('OUTLINE_PARSE_FAILED', mockT);
    expect(mockT).toHaveBeenCalledWith('butterfly.outlineParseError', expect.any(Object));

    vi.clearAllMocks();
    mapGachaError('429 Too Many', mockT);
    expect(mockT).toHaveBeenCalledWith('butterfly.rateLimitError', expect.any(Object));
  });

  it('prioritizes OUTLINE_TIMEOUT over generic "timed out" (order matters)', () => {
    // OUTLINE_TIMEOUT should match first (more specific)
    const result = mapGachaError('OUTLINE_TIMEOUT: timed out', mockT);
    expect(result.code).toBe('WHATIF_TIMEOUT_002');
  });
});
