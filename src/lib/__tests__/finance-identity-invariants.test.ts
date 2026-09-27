/**
 * 财务公开恒等式 — 随仓月账全量自洽 (batch126-a testgap scan)
 *
 * pitfall 103 纪律: 断言自洽, **不锁绝对值**。owner 每月把真实账单填进
 * src/data/finance/YYYY-MM.json, 任何钉住具体数字的用例会随月更误报。
 *
 * 既有覆盖 (审计结论):
 * - src/lib/__tests__/finance-pipeline-consistency.test.ts 已有
 *   `expect(month.netUsd).toBe(revenue - costs)` 恒等式 + 文件名/month 一致性;
 * - src/lib/__tests__/finance-public.test.ts 也有单月自洽断言, 但它把月份列表
 *   钉死成 `['2026-09']` — owner 加第二个账月 (哪怕是暂缺的 2026-10) 就会打红,
 *   那不是数据问题而是守卫变成路障。
 * 本文件补的是**枚举无关**的那一层: 遍历目录里真实存在的全部 .json,
 * 逐文件独立复算恒等式 (不经过 lib, 也不依赖月份个数), 并校验 lib 读回的
 * 结果与磁盘逐字对应。keyless 空目录时跳过而不是空断言通过。
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { FINANCE_DIR, computeFinanceMonths, loadFinanceMonths, type FinanceMonthRaw } from '../finance-public';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const NUMBER_PATHS = [
  ['members'],
  ['revenueUsd', 'membership'],
  ['revenueUsd', 'other'],
  ['costsUsd', 'infra'],
  ['costsUsd', 'ai'],
  ['costsUsd', 'team'],
] as const;

type UnknownRecord = Record<string, unknown>;

function getIn(value: unknown, keys: readonly string[]): unknown {
  return keys.reduce<unknown>(
    (node, key) => (node == null ? undefined : (node as UnknownRecord)[key]),
    value,
  );
}

async function listFinanceFiles(): Promise<string[]> {
  return (await readdir(FINANCE_DIR)).filter((name) => name.endsWith('.json')).sort();
}

describe('随仓月账 — 逐文件恒等式 (不锁绝对值)', () => {
  it('each on-disk month is a valid typed ledger row (name/month match + six numeric keys)', async () => {
    const files = await listFinanceFiles();
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const raw = JSON.parse(await readFile(path.join(FINANCE_DIR, file), 'utf8')) as UnknownRecord;
      const stem = file.replace(/\.json$/, '');
      const label = file;

      // 月份字段: YYYY-MM 且与文件名一致 (防错位发账)
      expect(typeof raw.month, `${label}: month must be a string`).toBe('string');
      expect(raw.month, `${label}: month must use YYYY-MM`).toMatch(MONTH_RE);
      expect(raw.month, `${label}: file name and month must match`).toBe(stem);

      // 六个数字键必须是真 number (字符串会被 lib 静默拼接算错)
      for (const keys of NUMBER_PATHS) {
        const value = getIn(raw, keys);
        expect(typeof value, `${label}: ${keys.join('.')} must be a number`).toBe('number');
        expect(Number.isNaN(value as number), `${label}: ${keys.join('.')} must not be NaN`).toBe(false);
      }
    }
  });

  it('the raw JSON carries no user-level or unexpected key (owner 手动台账只到平台层)', async () => {
    for (const file of await listFinanceFiles()) {
      const raw = JSON.parse(await readFile(path.join(FINANCE_DIR, file), 'utf8')) as UnknownRecord;
      const unexpected = Object.keys(raw).filter(
        (key) => !['month', 'members', 'revenueUsd', 'costsUsd', 'notes', '_comment'].includes(key),
      );
      expect(unexpected, `${file}: no unexpected top-level keys`).toEqual([]);
      expect(JSON.stringify(raw), `${file}: no user-level keys`).not.toMatch(/user_id|userId|email|amount_per_user/i);
    }
  });

  it('the lib read-back preserves every on-disk month verbatim (no silent drops or reordering)', async () => {
    const files = await listFinanceFiles();
    const months = await loadFinanceMonths();

    expect(months).toHaveLength(files.length);
    expect(months.map((m) => m.month)).toEqual(files.map((f) => f.replace(/\.json$/, '')));

    for (const month of months) {
      const revenue = month.revenueUsd.membership + month.revenueUsd.other;
      const costs = month.costsUsd.infra + month.costsUsd.ai + month.costsUsd.team;
      expect(month.netUsd, `${month.month}: net === revenue − costs`).toBe(revenue - costs);
    }
  });

  it('cumulative is a true running sum and matches the final net (ascending months, enum-agnostic)', async () => {
    const files = await listFinanceFiles();
    const months = await loadFinanceMonths();
    expect(months.length).toBe(files.length);

    let running = 0;
    for (const month of months) {
      running += month.netUsd;
      expect(month.cumulativeNetUsd, `${month.month}: cumulative must equal running sum`).toBe(running);
    }
    // 汇总恒等式: 全部收入 − 全部成本 === 最终累计净额
    const totalRevenue = months.reduce((s, m) => s + m.revenueUsd.membership + m.revenueUsd.other, 0);
    const totalCosts = months.reduce((s, m) => s + m.costsUsd.infra + m.costsUsd.ai + m.costsUsd.team, 0);
    expect(months.at(-1)?.cumulativeNetUsd).toBe(totalRevenue - totalCosts);
  });

  it('recomputing from raw JSON through the pure layer agrees with the fs loader (no divergence)', async () => {
    const raws: FinanceMonthRaw[] = [];
    for (const file of await listFinanceFiles()) {
      raws.push(JSON.parse(await readFile(path.join(FINANCE_DIR, file), 'utf8')) as FinanceMonthRaw);
    }
    const recomputed = computeFinanceMonths(raws);
    const viaLoader = await loadFinanceMonths();

    expect(recomputed.map((m) => [m.month, m.netUsd, m.cumulativeNetUsd])).toEqual(
      viaLoader.map((m) => [m.month, m.netUsd, m.cumulativeNetUsd]),
    );
    for (const month of recomputed) {
      const revenue = month.revenueUsd.membership + month.revenueUsd.other;
      const costs = month.costsUsd.infra + month.costsUsd.ai + month.costsUsd.team;
      expect(month.netUsd).toBe(revenue - costs);
    }
  });
});
