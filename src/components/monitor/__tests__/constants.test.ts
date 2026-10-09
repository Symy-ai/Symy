import { describe, expect, it } from 'vitest';

import {
  AUTO_SYNC_ENABLED_KEY,
  AUTO_SYNC_INTERVAL_MS,
  AUTO_SYNC_KEY,
} from '../constants';

/**
 * constants.ts (9行) — MonitorTab 常量 (C3)。
 *
 * 锁定: 5 分钟间隔+双 localStorage key 律。
 */
describe('monitor constants', () => {
  it('间隔 5 分钟', () => {
    expect(AUTO_SYNC_INTERVAL_MS).toBe(5 * 60 * 1000);
    expect(AUTO_SYNC_INTERVAL_MS).toBe(300000);
  });

  it('双 storage key 律 (symy_ 前缀)', () => {
    expect(AUTO_SYNC_KEY).toBe('symy_last_auto_sync');
    expect(AUTO_SYNC_ENABLED_KEY).toBe('symy_auto_sync_enabled');
    expect(AUTO_SYNC_KEY.startsWith('symy_')).toBe(true);
    expect(AUTO_SYNC_ENABLED_KEY.startsWith('symy_')).toBe(true);
  });
});
