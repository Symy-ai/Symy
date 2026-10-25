import { afterEach, describe, expect, it, vi } from 'vitest';
import { channelGlobalBudget, channelsEnabled } from '../config';

describe('channel config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails closed when CHANNELS_ENABLED is missing', () => {
    expect(channelsEnabled('telegram')).toBe(false);
  });

  it('enables a listed platform with case and whitespace tolerance', () => {
    vi.stubEnv('CHANNELS_ENABLED', ' Telegram , WECHAT_MP ');
    expect(channelsEnabled('telegram')).toBe(true);
    expect(channelsEnabled('wechat_mp')).toBe(true);
  });

  it('keeps an unlisted platform disabled', () => {
    vi.stubEnv('CHANNELS_ENABLED', 'telegram');
    expect(channelsEnabled('wechat_wecom')).toBe(false);
  });

  it('returns the default global budget when missing', () => {
    expect(channelGlobalBudget()).toBe(2000);
  });

  it('falls back to the default budget for invalid values', () => {
    vi.stubEnv('CHANNEL_GLOBAL_DAILY_BUDGET', '-1');
    expect(channelGlobalBudget()).toBe(2000);
    vi.stubEnv('CHANNEL_GLOBAL_DAILY_BUDGET', '1.5');
    expect(channelGlobalBudget()).toBe(2000);
    vi.stubEnv('CHANNEL_GLOBAL_DAILY_BUDGET', 'invalid');
    expect(channelGlobalBudget()).toBe(2000);
  });

  it('parses a positive integer budget', () => {
    vi.stubEnv('CHANNEL_GLOBAL_DAILY_BUDGET', ' 123 ');
    expect(channelGlobalBudget()).toBe(123);
  });
});
