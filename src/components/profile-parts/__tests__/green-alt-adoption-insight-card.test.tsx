// @vitest-environment happy-dom
/* eslint-disable require-await -- test mocks use async for API consistency */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'fs';

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }));
import { apiFetch } from '@/lib/api-client';

const zhMsgs = JSON.parse(readFileSync('src/i18n/messages/zh.json', 'utf8'));
const enMsgs = JSON.parse(readFileSync('src/i18n/messages/en.json', 'utf8'));
let locale = 'zh';
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale,
    t: (key: string, params?: Record<string, unknown>) => {
      let value: unknown = locale === 'zh' ? zhMsgs : enMsgs;
      for (const part of key.split('.')) value = (value as Record<string, unknown>)?.[part];
      let result = typeof value === 'string' ? value : key;
      for (const [name, replacement] of Object.entries(params ?? {})) {
        result = result.replace(`{${name}}`, String(replacement));
      }
      return result;
    },
  }),
}));

const adoption = (entryId: string, category: string, createdAt: string) => ({
  eventType: 'mindful_recovery',
  metadata: { kind: 'green_alt_adoption', entryId, category },
  createdAt,
});

const rejection = (reason: string, createdAt: string) => ({
  eventType: 'manual_adjustment',
  metadata: { source: 'green_alt_rejection', entryId: 'shoe_repair_first', reason },
  createdAt,
});

const now = new Date();
const iso = (offsetDays: number) => new Date(now.getTime() - offsetDays * 86400000).toISOString();
const insufficientEvents = [adoption('repair_first', 'repair-care', iso(1))];

function mockApi() {
  vi.mocked(apiFetch).mockImplementation(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('mindful_recovery')) return { events: [adoption('repair_first', 'repair-care', iso(20)), adoption('ivory_bone_carving', 'wear', iso(19))] };
    if (url.includes('manual_adjustment')) return { events: [rejection('already_have', iso(18)), rejection('already_have', iso(17)), rejection('not_now', iso(16))] };
    return { events: [] };
  });
}


beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  locale = 'zh';
});

afterEach(() => {
  // 显式卸载：共享机高负载下若 RTL auto-cleanup 未注册，残留渲染会让
  // getByTestId 命中多元素假红（gate 01:08 实录）；显式 cleanup 使文件免疫。
  cleanup();
  vi.clearAllMocks();
});

describe('GreenAltAdoptionInsightCard', () => {
  it('renders insufficient state without fake conclusions', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ events: insufficientEvents });
    const { GreenAltAdoptionInsightCard: Fresh } = await import('../green-alt-adoption-insight-card');
    render(<Fresh />);
    await vi.waitFor(() => expect(screen.getByTestId('green-alt-insight-card-empty')).toBeTruthy(), { timeout: 10000 });
  });

  it('renders zh metrics with stable formatting and non-shaming advice', async () => {
    mockApi();
    const { GreenAltAdoptionInsightCard: Card } = await import('../green-alt-adoption-insight-card');
    render(<Card />);
    expect(await screen.findByTestId('green-alt-insight-card')).toBeTruthy();
    expect(screen.getByTestId('green-alt-insight-headline').textContent).toBe('近 90 天采纳率 40% · 5 次建议 · 5 天有反馈');
    expect(screen.getByTestId('green-alt-insight-less').textContent).toContain('下次更少打扰');
    expect(document.body.textContent).not.toMatch(/[¥$]\d|kgCO/i);
  });

  it('renders en metrics and provides no share surface', async () => {
    locale = 'en';
    mockApi();
    const { GreenAltAdoptionInsightCard: Card } = await import('../green-alt-adoption-insight-card');
    render(<Card />);
    expect(await screen.findByTestId('green-alt-insight-card')).toBeTruthy();
    expect(screen.getByTestId('green-alt-insight-headline').textContent).toBe('90-day adoption 40% · 5 suggestions · 5 days with feedback');
    expect(screen.queryByTestId('green-alt-insight-share')).toBeNull();
  });
});
