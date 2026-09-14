// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'fs';
import { ImpulseTriggerCard } from '../impulse-trigger-card';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api-client';

/** zh/en 双语词表快照 — 从真实 i18n 文件取, 断言复用既有 interceptReason 词表 */
const zhMsgs = JSON.parse(readFileSync('src/i18n/messages/zh.json', 'utf-8'));
const enMsgs = JSON.parse(readFileSync('src/i18n/messages/en.json', 'utf-8'));

function flat(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') Object.assign(out, flat(v as Record<string, unknown>, `${prefix}${k}.`));
    else out[`${prefix}${k}`] = String(v);
  }
  return out;
}

let locale = 'en';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => {
    const translations = locale === 'zh' ? flat(zhMsgs) : flat(enMsgs);
    return {
      t: (key: string, params?: Record<string, unknown>) => {
        let result = translations[key] ?? key;
        if (params) {
          for (const [k, v] of Object.entries(params)) {
            result = result.replace(`{${k}}`, String(v));
          }
        }
        return result;
      },
      locale,
    };
  },
}));

function mockEvents(events: Array<Record<string, unknown>>) {
  vi.mocked(apiFetch).mockResolvedValue({ events });
}

function interceptEvents(): Array<Record<string, unknown>> {
  return [
    { metadata: { itemName: 'sneakers', category: 'clothing' }, createdAt: '2026-06-01T23:30:00' },
    { metadata: { itemName: 'hoodie', category: 'clothing' }, createdAt: '2026-06-01T23:30:00' },
    { metadata: { itemName: 'cap', category: 'clothing' }, createdAt: '2026-06-02T23:30:00' },
    { metadata: { itemName: 'disposable cups' }, createdAt: '2026-06-03T13:30:00' },
  ];
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ImpulseTriggerCard', () => {
  it('renders skeleton while loading', () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}) as never);
    render(<ImpulseTriggerCard />);
    expect(screen.getByTestId('impulse-trigger-card-skeleton')).toBeTruthy();
  });

  it('renders empty guide state on fetch failure (no fake profile)', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('network') as never);
    render(<ImpulseTriggerCard />);
    await screen.findByTestId('impulse-trigger-card-empty');
    expect(document.body.textContent).not.toMatch(/\$\d/);
  });

  it('renders empty guide state on insufficient samples', async () => {
    mockEvents(interceptEvents().slice(0, 1));
    render(<ImpulseTriggerCard />);
    await screen.findByTestId('impulse-trigger-card-empty');
  });

  it('renders zh: top reasons reuse interceptReason vocabulary, counts only, no amounts', async () => {
    locale = 'zh';
    mockEvents(interceptEvents());
    render(<ImpulseTriggerCard />);
    await screen.findByTestId('impulse-trigger-card');

    // Top 原因标签来自 chat.interceptReason.* 既有词表 (zh 真实文案)
    expect(screen.getByTestId('impulse-trigger-reason-label-0').textContent).toContain(
      zhMsgs.chat.interceptReason.impulse,
    );
    expect(screen.getByTestId('impulse-trigger-reason-label-1').textContent).toContain(
      zhMsgs.chat.interceptReason.nonGreen.disposable,
    );
    // 纯计数: 次数/天数
    expect(screen.getByTestId('impulse-trigger-card-counts').textContent).toBe('4 次拦截 · 3 天');
    // 建议存在且非羞辱 (词表文案含"触发"归因)
    expect(screen.getByTestId('impulse-trigger-card-advice').textContent).toContain(
      zhMsgs.profile.impulseTriggerAdvice.impulse,
    );
    // 金额红线: 卡面无 $ 数字
    expect(document.body.textContent).not.toMatch(/\$\d/);
  });

  it('renders en: same reuse + bilingual labels', async () => {
    locale = 'en';
    mockEvents(interceptEvents());
    render(<ImpulseTriggerCard />);
    await screen.findByTestId('impulse-trigger-card');

    expect(screen.getByTestId('impulse-trigger-reason-label-0').textContent).toContain(
      enMsgs.chat.interceptReason.impulse,
    );
    expect(screen.getByTestId('impulse-trigger-card-counts').textContent).toBe('4 intercepts · 3 days');
  });

  it('share face opens on click and is structurally amount-free (counts/days/reason label only)', async () => {
    locale = 'en';
    mockEvents(interceptEvents());
    render(<ImpulseTriggerCard />);
    fireEvent.click(await screen.findByTestId('impulse-trigger-share-btn'));

    const face = await screen.findByTestId('impulse-trigger-share-face');
    expect(face.textContent).toContain(String(4));
    expect(face.textContent).toContain(enMsgs.chat.interceptReason.impulse);
    // 分享面金额红线
    expect(face.textContent).not.toMatch(/\$\d/);
    expect(face.textContent).not.toMatch(/\d+\.\d\d/);
  });
});
