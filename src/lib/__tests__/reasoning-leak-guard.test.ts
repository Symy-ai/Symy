import { describe, expect, it } from 'vitest';
import { sanitizeLeakedReasoning } from '../reasoning-leak-guard';

const LEAKED =
  'The user says they want to buy a new jacket before the green gate.\n' +
  "I should respond in Chinese because the user's locale is zh.\n" +
  'Let me check the challenge context first, then write a short reply.\n' +
  'Okay, the tone should be warm and non-judgmental.\n' +
  '\n' +
  '这件外套值得一次看见。它大约需要 40 小时的自由时间。\n' +
  '你可以先让它放一放，我陪你一起守这道门。';

describe('sanitizeLeakedReasoning', () => {
  it('cuts multi-line English CoT leak to the first Chinese segment', () => {
    const out = sanitizeLeakedReasoning(LEAKED);
    expect(out).toBe('这件外套值得一次看见。它大约需要 40 小时的自由时间。\n你可以先让它放一放，我陪你一起守这道门。');
    expect(out).not.toContain('The user');
  });

  it('keeps a normal multi-line Chinese reply untouched', () => {
    const reply = '我看见了这个想买。\n它值 3 小时的自由时间。\n你打算怎么安置它？';
    expect(sanitizeLeakedReasoning(reply)).toBe(reply);
  });

  it('keeps a normal English reply untouched (no CJK → no cut)', () => {
    const reply =
      'Let me reflect that back to you.\n' +
      'I should say this jacket costs about 40 hours.\n' +
      'The user gets to decide what happens next.';
    expect(sanitizeLeakedReasoning(reply)).toBe(reply);
  });

  it('keeps a short mixed reply untouched (fewer than 3 lines / fewer than 2 opener lines)', () => {
    const reply = 'Sure — 这就是它的代价。\nI should mention the hours too.';
    expect(sanitizeLeakedReasoning(reply)).toBe(reply);
  });

  it('keeps an English-dominant reply with a single Chinese sentence but no opener pattern', () => {
    const reply =
      'This jacket is listed at ¥328.\n' +
      'At your hourly rate that is about 16 hours of freedom.\n' +
      '你想先放一放吗？';
    expect(sanitizeLeakedReasoning(reply)).toBe(reply);
  });

  it('passes through empty and single-line text', () => {
    expect(sanitizeLeakedReasoning('')).toBe('');
    expect(sanitizeLeakedReasoning('The user says hi — 我先看见一下')).toBe('The user says hi — 我先看见一下');
  });
});
