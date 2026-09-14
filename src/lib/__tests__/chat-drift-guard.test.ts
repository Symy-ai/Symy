import { describe, expect, it, vi } from 'vitest';
import { applyDriftGuard, DRIFT_REPLACEMENTS } from '../chat-drift-guard';

describe('applyDriftGuard', () => {
  it('returns null when content is empty', () => {
    expect(applyDriftGuard('', 'turn-1')).toBeNull();
    expect(applyDriftGuard('   ', 'turn-1')).toBeNull();
  });

  it('passes through clean text unchanged', () => {
    const text = 'This jacket is made to last. You already have what you need.';
    expect(applyDriftGuard(text, 'turn-1')).toBeNull();
  });

  it.each([
    { text: 'Limited-time offer ends tonight!', expected: 'sales_push' },
    { text: 'Flash sale — buy now before it is gone.', expected: 'sales_push' },
    { text: 'Only 3 left — selling fast.', expected: 'urgency_pressure' },
    { text: 'Almost gone. Countdown to the end.', expected: 'urgency_pressure' },
    { text: 'You should buy this now.', expected: 'purchase_pressure' },
    { text: 'Best time to buy is right now.', expected: 'purchase_pressure' },
    { text: 'Save big on your order today.', expected: 'promotional_imperative' },
    { text: 'Massive discount — limited offer.', expected: 'promotional_imperative' },
  ])('detects $expected in "$text"', ({ text, expected }) => {
    expect(applyDriftGuard(text, 'turn-1')).toBe(expected);
  });

  it('logs drift event when detected', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    applyDriftGuard('Flash sale — buy now!', 'turn-abc');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logArg = warnSpy.mock.calls[0]?.[1];
    expect(logArg).toMatchObject({
      ts: expect.any(String),
      turnId: 'turn-abc',
      driftType: 'sales_push',
      replacement: DRIFT_REPLACEMENTS.sales_push,
    });
    warnSpy.mockRestore();
  });
});
