import { describe, expect, it } from 'vitest';

import * as barrel from '../index';
import * as constants from '../constants';
import * as helpers from '../helpers';
import * as types from '../types';

/**
 * monitor/index.ts (19行) — C3 拆分 barrel (纯转发)。
 *
 * 锁定:
 * - 四组导出可达 (types/constants/helpers/三组件)
 * - 具名锚: 三常量/三 helper/三组件
 * - 禁私增
 */
describe('monitor barrel 导出面', () => {
  it('三常量+三 helper+三组件+五类型可达', () => {
    expect(barrel.AUTO_SYNC_INTERVAL_MS).toBe(constants.AUTO_SYNC_INTERVAL_MS);
    expect(barrel.AUTO_SYNC_KEY).toBe(constants.AUTO_SYNC_KEY);
    expect(barrel.AUTO_SYNC_ENABLED_KEY).toBe(constants.AUTO_SYNC_ENABLED_KEY);
    expect(barrel.getPlatformEmoji).toBe(helpers.getPlatformEmoji);
    expect(barrel.formatReceiptTime).toBe(helpers.formatReceiptTime);
    expect(barrel.formatCountdown).toBe(helpers.formatCountdown);
    expect(barrel.EmailConnectionCard).toBeTruthy(); // memo/forwardRef 对象或函数
    expect(barrel.EmailReceiptsList).toBeTruthy();
    expect(typeof barrel.ToastNotification).toBe('object'); // memo 包裹 (R275)
    expect((types as Record<string, unknown>).MonitorTabProps).toBeUndefined(); // 纯类型 (运行时无值)
  });

  it('barrel 值导出面 = 常量+helper+组件并集 (禁私增)', () => {
    const union = new Set<string>([
      ...Object.keys(constants),
      ...Object.keys(helpers),
      'EmailConnectionCard',
      'EmailReceiptsList',
      'ToastNotification',
    ]);
    for (const k of Object.keys(barrel)) {
      expect(union.has(k)).toBe(true); // 每个值导出都有出处
    }
    expect(Object.keys(barrel).length).toBeGreaterThanOrEqual(9);
  });
});
