// @vitest-environment happy-dom

/**
 * Finance data pipeline consistency (batch99-f).
 *
 * The checks intentionally mirror scripts/validate-finance-data.mjs instead of
 * importing it: valid owner input must survive every gate from raw JSON through
 * the data layer to the public page.
 */

import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(),
}));

import FinancePage from '@/app/[locale]/transparency/finance/page';
import {
  FINANCE_DIR,
  formatMemberCount,
  formatSignedUsd,
  formatUsd,
  loadFinanceMonths,
} from '../finance-public';
import { getTranslations } from 'next-intl/server';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
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

function validateLikeOwnerScript(fileName: string, raw: string): string[] {
  const problems: string[] = [];
  let data: unknown;

  try {
    data = JSON.parse(raw) as unknown;
  } catch (error) {
    // safe to ignore: 测试内解析失败按校验错误路径返回（错误即本用例的断言对象），无需上抛
    return [`JSON parse failed: ${error instanceof Error ? error.message : String(error)}`];
  }

  const record = data as UnknownRecord | null;
  const month = record?.month;
  const stem = fileName.replace(/\.json$/, '');

  if (typeof month !== 'string' || !MONTH_PATTERN.test(month)) {
    problems.push('month must use YYYY-MM');
  } else if (month !== stem) {
    problems.push('file name and month must match');
  }

  for (const keys of NUMBER_PATHS) {
    const value = getIn(data, keys);
    if (typeof value !== 'number' || Number.isNaN(value)) {
      problems.push(`${keys.join('.')} must be a number`);
    }
  }

  return problems;
}

describe('finance data pipeline consistency', () => {
  beforeEach(() => {
    (getTranslations as ReturnType<typeof vi.fn>).mockResolvedValue((key: string) => key);
  });

  it('keeps validate-script, library, and page rendering aligned for all active files', async () => {
    const fileNames = (await readdir(FINANCE_DIR)).filter((name) => name.endsWith('.json')).sort();
    expect(fileNames.length).toBeGreaterThan(0);

    const rawFiles = await Promise.all(
      fileNames.map(async (fileName) => ({
        fileName,
        raw: await readFile(path.join(FINANCE_DIR, fileName), 'utf8'),
      })),
    );

    const validatedMonths: string[] = [];
    for (const { fileName, raw } of rawFiles) {
      const problems = validateLikeOwnerScript(fileName, raw);
      expect(problems, `${fileName} must pass the owner validation rules`).toEqual([]);

      const month = (JSON.parse(raw) as UnknownRecord).month;
      if (typeof month === 'string' && MONTH_PATTERN.test(month)) validatedMonths.push(month);
    }

    expect(new Set(validatedMonths).size).toBe(validatedMonths.length);

    const months = await loadFinanceMonths();
    expect(months.map((month) => month.month)).toEqual(validatedMonths.sort());

    for (const month of months) {
      const revenue = month.revenueUsd.membership + month.revenueUsd.other;
      const costs = month.costsUsd.infra + month.costsUsd.ai + month.costsUsd.team;
      expect(Number.isFinite(month.members)).toBe(true);
      expect(Number.isFinite(revenue)).toBe(true);
      expect(Number.isFinite(costs)).toBe(true);
      expect(month.netUsd).toBe(revenue - costs);
      expect(Number.isFinite(month.cumulativeNetUsd)).toBe(true);
    }

    const page = await FinancePage({ params: Promise.resolve({ locale: 'en' }) });
    render(page);

    expect(screen.getAllByTestId(/^finance-row-/)).toHaveLength(months.length);
    for (const month of months) {
      const row = screen.getByTestId(`finance-row-${month.month}`);
      const revenue = month.revenueUsd.membership + month.revenueUsd.other;
      const costs = month.costsUsd.infra + month.costsUsd.ai + month.costsUsd.team;
      expect(row.textContent).toContain(formatMemberCount(month.members, 'en'));
      expect(row.textContent).toContain(formatUsd(revenue, 'en'));
      expect(row.textContent).toContain(formatUsd(costs, 'en'));
      expect(row.textContent).toContain(formatSignedUsd(month.netUsd, 'en'));
    }
    expect(screen.getByTestId('finance-cumulative').textContent).toContain(
      formatSignedUsd(months.at(-1)?.cumulativeNetUsd ?? 0, 'en'),
    );
  });

  it('degrades to an empty book when the owner script would reject malformed JSON', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'finance-pipeline-consistency-'));

    try {
      await writeFile(path.join(directory, '2026-01.json'), '{');

      const problems = validateLikeOwnerScript('2026-01.json', '{');
      expect(problems.length).toBeGreaterThan(0);
      await expect(loadFinanceMonths(directory)).resolves.toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
