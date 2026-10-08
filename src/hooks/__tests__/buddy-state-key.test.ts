
import { describe, expect, it } from 'vitest';
import { BUDDY_STATE_KEY } from '../../hooks/buddy-state-key';

describe('BUDDY_STATE_KEY', () => {
  it('has the stable canonical query key', () => {
    expect(BUDDY_STATE_KEY).toEqual(['buddy-state']);
  });

  it('preserves identity between reads', () => {
    expect(BUDDY_STATE_KEY).toBe(BUDDY_STATE_KEY);
    expect(BUDDY_STATE_KEY).toHaveLength(1);
  });

  it('is distinguishable from other buddy cache keys', () => {
    expect(BUDDY_STATE_KEY).not.toEqual(['buddy-state', 'history']);
    expect(BUDDY_STATE_KEY).not.toEqual(['buddy-actions']);
  });
});
