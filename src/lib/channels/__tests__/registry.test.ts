import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAdapter, registerAdapter } from '../registry';
import type { ChannelAdapter } from '../types';

function createAdapter(overrides?: Partial<ChannelAdapter>): ChannelAdapter {
  return {
    platform: 'telegram',
    capabilities: { asyncPush: true },
    verify: vi.fn(),
    parse: vi.fn(),
    sendMessage: vi.fn(),
    ...overrides,
  };
}

describe('channel registry', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('returns null for an unregistered platform', () => {
    expect(getAdapter('telegram')).toBeNull();
  });

  it('rejects adapters that cannot push asynchronously', () => {
    const adapter = createAdapter({ capabilities: { asyncPush: false } });
    expect(() => registerAdapter(adapter)).toThrow(/asyncPush/);
    expect(getAdapter('telegram')).toBeNull();
  });

  it('rejects duplicate registration for the same platform', async () => {
    const { getAdapter: get, registerAdapter: register } = await import('../registry');
    register(createAdapter());
    expect(() => register(createAdapter())).toThrow(/already registered/);
    expect(get('telegram')).not.toBeNull();
  });
});
