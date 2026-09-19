/**
 * Tests for finance-public data layer (batch83-a)
 *
 * - 纯计算: 多月份乱序输入 → 升序排序 + 逐月净利润 + 累计净额 (亏损月为负不钳)
 * - 真实仓库数据: 随仓示例月 2026-09.json 可解析且为全 0 占位 (诚实原则)
 * - 降级红线: 目录缺失 / 坏 JSON / 空目录 / 无 month 字段 → 空数组, 不炸
 *
 * fs 用例全部走 os.tmpdir() 临时目录 — 生产数据目录 src/data/finance/ 只放
 * 真实月份文件, 测试夹具不进仓。
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  computeFinanceMonths,
  formatMemberCount,
  formatSignedUsd,
  formatUsd,
  isAllZeroPlaceholder,
  loadFinanceMonths,
  summarizeFinanceMonths,
  FINANCE_DIR,
  type FinanceMonthRaw,
} from '../finance-public';

const TMP_PREFIX = path.join(tmpdir(), 'symy-finance-test-');

function makeTmpDir(): Promise<string> {
  return mkdtemp(TMP_PREFIX);
}

const RAW: FinanceMonthRaw = {
  month: '2026-01',
  members: 10,
  revenueUsd: { membership: 100, other: 0 },
  costsUsd: { infra: 30, ai: 10, team: 0 },
};

describe('computeFinanceMonths — 纯计算', () => {
  it('乱序多月份 → 升序排序 + 逐月净利润 + 累计净额', () => {
    const jan = { ...RAW };
    const feb: FinanceMonthRaw = {
      month: '2026-02',
      members: 12,
      revenueUsd: { membership: 120, other: 5 },
      costsUsd: { infra: 30, ai: 10, team: 60 },
    };
    const mar: FinanceMonthRaw = {
      month: '2026-03',
      members: 9,
      revenueUsd: { membership: 90, other: 0 },
      costsUsd: { infra: 30, ai: 10, team: 0 },
    };

    const out = computeFinanceMonths([mar, jan, feb]); // 故意乱序

    expect(out.map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(out[0].netUsd).toBe(60);
    expect(out[1].netUsd).toBe(25); // 125 - 100
    expect(out[2].netUsd).toBe(50);
    expect(out.map((m) => m.cumulativeNetUsd)).toEqual([60, 85, 135]);
  });

  it('亏损月净额为负且累计随之递减 — 不钳成 0 (诚实原则)', () => {
    const loss: FinanceMonthRaw = {
      month: '2026-02',
      members: 5,
      revenueUsd: { membership: 40, other: 0 },
      costsUsd: { infra: 30, ai: 10, team: 60 },
    };
    const out = computeFinanceMonths([RAW, loss]);
    expect(out[1].netUsd).toBe(-60);
    expect(out[1].cumulativeNetUsd).toBe(0); // 60 + (-60)
  });

  it('空输入 → 空数组', () => {
    expect(computeFinanceMonths([])).toEqual([]);
  });
});

describe('presentation helpers — locale / honesty guards', () => {
  it('formats positive and fractional USD amounts for zh and en locales', () => {
    expect(formatUsd(1234567.5, 'zh')).toBe('1,234,567.5');
    expect(formatUsd(1234567.5, 'en')).toBe('1,234,567.5');
    expect(formatUsd(1000, 'zh')).toBe('1,000');
    expect(formatUsd(1000, 'en')).toBe('1,000');
  });

  it('keeps negative net amounts signed instead of clamping them to zero', () => {
    expect(formatSignedUsd(-1234.5, 'zh')).toBe('-$1,234.5');
    expect(formatSignedUsd(-1234.5, 'en')).toBe('-$1,234.5');
    expect(formatSignedUsd(60, 'en')).toBe('$60');
  });

  it('rounds member counts to non-negative locale-formatted integers', () => {
    expect(formatMemberCount(1234.5, 'zh')).toBe('1,235');
    expect(formatMemberCount(1234.4, 'en')).toBe('1,234');
    expect(formatMemberCount(-8, 'en')).toBe('0');
  });

  it('marks only all-zero books as placeholders, including mixed month sets', () => {
    const zeroMonth = computeFinanceMonths([
      { ...RAW, members: 0, revenueUsd: { membership: 0, other: 0 }, costsUsd: { infra: 0, ai: 0, team: 0 } },
    ]);
    const realMonth = computeFinanceMonths([RAW]);

    expect(isAllZeroPlaceholder(zeroMonth)).toBe(true);
    expect(isAllZeroPlaceholder(realMonth)).toBe(false);
    expect(isAllZeroPlaceholder([...zeroMonth, ...realMonth])).toBe(false);
  });
});

describe('summarizeFinanceMonths — totals / cumulative consistency', () => {
  it('derives totals, final cumulative net, and placeholder state from sorted months', () => {
    const months = computeFinanceMonths([
      {
        month: '2026-02',
        members: 12,
        revenueUsd: { membership: 120, other: 5 },
        costsUsd: { infra: 30, ai: 10, team: 60 },
      },
      { ...RAW },
    ]);

    const summary = summarizeFinanceMonths(months);

    expect(summary.totalRevenueUsd).toBe(225);
    expect(summary.totalCostsUsd).toBe(140);
    expect(summary.cumulativeNetUsd).toBe(months.at(-1)?.cumulativeNetUsd);
    expect(summary.cumulativeNetUsd).toBe(summary.totalRevenueUsd - summary.totalCostsUsd);
    expect(summary.isAllZeroPlaceholder).toBe(false);
  });

  it('summarizes an empty book with zero totals and placeholder-compatible values', () => {
    const summary = summarizeFinanceMonths([]);

    expect(summary.totalRevenueUsd).toBe(0);
    expect(summary.totalCostsUsd).toBe(0);
    expect(summary.cumulativeNetUsd).toBe(0);
    expect(summary.isAllZeroPlaceholder).toBe(true);
  });
});

describe('loadFinanceMonths — 文件层与降级', () => {
  const cleanup: string[] = [];
  afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  it('真实仓库数据: 随仓示例月 2026-09.json 可解析, 全 0 占位, 净额 0', async () => {
    const months = await loadFinanceMonths(); // 默认 FINANCE_DIR = <repo>/src/data/finance

    expect(months.map((m) => m.month)).toEqual(['2026-09']);
    expect(months[0].members).toBe(0);
    expect(months[0].netUsd).toBe(0);
    expect(months[0].cumulativeNetUsd).toBe(0);
  });

  it('多月份文件按文件名升序读入并累计', async () => {
    const dir = await makeTmpDir();
    cleanup.push(dir);
    await writeFile(
      path.join(dir, '2026-02.json'),
      JSON.stringify({ month: '2026-02', members: 12, revenueUsd: { membership: 120, other: 0 }, costsUsd: { infra: 20, ai: 0, team: 0 } }),
    );
    await writeFile(
      path.join(dir, '2026-01.json'),
      JSON.stringify({ month: '2026-01', members: 10, revenueUsd: { membership: 100, other: 0 }, costsUsd: { infra: 20, ai: 0, team: 0 } }),
    );

    const months = await loadFinanceMonths(dir);

    expect(months.map((m) => m.month)).toEqual(['2026-01', '2026-02']);
    expect(months[1].cumulativeNetUsd).toBe(180); // 80 + 100
  });

  it('坏 JSON → 返回空数组降级, 不炸', async () => {
    const dir = await makeTmpDir();
    cleanup.push(dir);
    await writeFile(path.join(dir, '2026-01.json'), '{not valid json!!');

    expect(await loadFinanceMonths(dir)).toEqual([]);
  });

  it('目录缺失 → 空数组降级, 不炸', async () => {
    expect(await loadFinanceMonths(path.join(TMP_PREFIX, 'does-not-exist'))).toEqual([]);
  });

  it('空目录 (无 .json) → 空数组', async () => {
    const dir = await makeTmpDir();
    cleanup.push(dir);
    await mkdir(path.join(dir, 'subdir'), { recursive: true }); // 非 .json 条目应被过滤

    expect(await loadFinanceMonths(dir)).toEqual([]);
  });

  it('JSON 合法但缺 month 字段 → 过滤后为空, 不参与排序比较', async () => {
    const dir = await makeTmpDir();
    cleanup.push(dir);
    await writeFile(path.join(dir, 'bogus.json'), JSON.stringify({ foo: 1 }));

    expect(await loadFinanceMonths(dir)).toEqual([]);
  });

  it('FINANCE_DIR 指向仓库内 src/data/finance (与代码同仓可审计)', () => {
    expect(FINANCE_DIR.replace(/\\/g, '/')).toMatch(/src\/data\/finance$/);
  });
});
