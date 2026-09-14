// @vitest-environment happy-dom

/**
 * GuardStyleCard 渲染测试 (batch56-c) — 风格名/三轨条形对比/点评/私享里子行,
 * 分享面 amount-free 红线, 样本不足降级。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'fs';
import { GuardStyleCard } from '../guard-style-card';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api-client';

/** zh/en 双语词表快照 — 从真实 i18n 文件取, 断言复用 guardStyle 词表 */
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

const day = (n: number) => `2026-09-${String(n).padStart(2, '0')}T10:00:00`;

function mockEvents(
  guard: Array<Record<string, unknown>>,
  recovery: Array<Record<string, unknown>> = [],
) {
  vi.mocked(apiFetch).mockImplementation(((url: unknown) => {
    const u = String(url);
    if (u.includes('challenge_completed')) return Promise.resolve({ events: guard });
    return Promise.resolve({ events: recovery });
  }) as never);
}

function substitutorEvents() {
  return {
    guard: [
      { eventType: 'challenge_completed', triggerId: 'c1', metadata: { savedAmount: 12 }, createdAt: day(1) },
    ],
    recovery: [
      { eventType: 'mindful_recovery', triggerId: 'g1', metadata: { kind: 'green_alt_adoption', estSaved: 8 }, createdAt: day(2) },
      { eventType: 'mindful_recovery', triggerId: 'g2', metadata: { kind: 'green_alt_adoption', estSaved: 6 }, createdAt: day(3) },
      { eventType: 'mindful_recovery', triggerId: 'g3', metadata: { kind: 'green_alt_adoption', estSaved: 4 }, createdAt: day(4) },
      { eventType: 'mindful_recovery', triggerId: 'g4', metadata: { kind: 'green_alt_adoption', estSaved: 2 }, createdAt: day(5) },
    ],
  };
}

function balancedEvents() {
  return {
    guard: [
      { eventType: 'challenge_completed', triggerId: 'c1', metadata: null, createdAt: day(1) },
      { eventType: 'challenge_completed', triggerId: 'c2', metadata: null, createdAt: day(2) },
    ],
    recovery: [
      { eventType: 'mindful_recovery', triggerId: 'g1', metadata: { kind: 'green_alt_adoption' }, createdAt: day(3) },
      { eventType: 'mindful_recovery', triggerId: 'g2', metadata: { kind: 'green_alt_adoption' }, createdAt: day(4) },
      { eventType: 'mindful_recovery', triggerId: 'r1', metadata: { kind: 'reuse_adoption' }, createdAt: day(5) },
      { eventType: 'mindful_recovery', triggerId: 'r2', metadata: { kind: 'reuse_adoption' }, createdAt: day(6) },
    ],
  };
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GuardStyleCard', () => {
  it('renders skeleton while loading', () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}) as never);
    render(<GuardStyleCard />);
    expect(screen.getByTestId('guard-style-card-skeleton')).toBeTruthy();
  });

  it('renders empty guide state on fetch failure (no fake profile)', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('network') as never);
    render(<GuardStyleCard />);
    await screen.findByTestId('guard-style-card-empty');
  });

  it('renders empty guide state on insufficient samples (<5)', async () => {
    mockEvents(substitutorEvents().guard.slice(0, 1));
    render(<GuardStyleCard />);
    await screen.findByTestId('guard-style-card-empty');
  });

  it('renders zh: substitutor style name + track bars + comment + private saved line', async () => {
    locale = 'zh';
    const { guard, recovery } = substitutorEvents();
    mockEvents(guard, recovery);
    render(<GuardStyleCard />);
    await screen.findByTestId('guard-style-card');

    expect(screen.getByTestId('guard-style-card-style-name').textContent).toContain(
      zhMsgs.profile.guardStyle.styleName.substitutor,
    );
    expect(screen.getByTestId('guard-style-card-counts').textContent).toBe('5 次绿色行动 · 5 天');
    // 三轨条形对比: 拦截 ×1 / 替代 ×4 / 复用 ×0
    expect(screen.getByTestId('guard-style-track-count-guard').textContent).toBe('×1');
    expect(screen.getByTestId('guard-style-track-count-alt').textContent).toBe('×4');
    expect(screen.getByTestId('guard-style-track-count-reuse').textContent).toBe('×0');
    // 点评来自 guardStyle.comment 词表 (非羞辱)
    expect(screen.getByTestId('guard-style-card-comment').textContent).toContain(
      zhMsgs.profile.guardStyle.comment.substitutor,
    );
    // 私享里子行: 三轨 estSaved/savedAmount 汇总 (App 内私享先例, 允许出现在卡面)
    expect(screen.getByTestId('guard-style-card-saved-private').textContent).toContain('¥12');
    expect(screen.getByTestId('guard-style-card-saved-private').textContent).toContain('¥20');
  });

  it('renders en: balanced style uses dedicated encouragement copy (non-shaming)', async () => {
    locale = 'en';
    const { guard, recovery } = balancedEvents();
    mockEvents(guard, recovery);
    render(<GuardStyleCard />);
    await screen.findByTestId('guard-style-card');

    expect(screen.getByTestId('guard-style-card-style-name').textContent).toContain(
      enMsgs.profile.guardStyle.styleName.balanced,
    );
    expect(screen.getByTestId('guard-style-card-comment').textContent).toContain(
      enMsgs.profile.guardStyle.comment.balanced,
    );
    // balanced 档不加 guard-intensity 尾句
    expect(screen.getByTestId('guard-style-card-comment').textContent).not.toContain(
      enMsgs.profile.guardStyle.commentIntensity.strict,
    );
  });

  it('share face opens on click and is structurally amount-free', async () => {
    locale = 'en';
    const { guard, recovery } = substitutorEvents();
    mockEvents(guard, recovery);
    render(<GuardStyleCard />);
    fireEvent.click(await screen.findByTestId('guard-style-share-btn'));

    const face = await screen.findByTestId('guard-style-share-face');
    // 判词来自 guardStyle.share.verdict (amount-free)
    expect(screen.getByTestId('guard-style-share-verdict').textContent).toContain('4');
    // 三轨次数面板 (纯计数)
    expect(screen.getByTestId('guard-style-share-stats').textContent).toContain('4');
    // 分享面金额红线: 无 $ 数字 / 小数金额
    expect(face.textContent).not.toMatch(/\$\d/);
    expect(face.textContent).not.toMatch(/¥\d/);
    expect(face.textContent).not.toMatch(/\d+\.\d\d/);
    // 私享行绝不进分享面
    expect(face.textContent).not.toContain(enMsgs.profile.guardStyle.savedLine.split(':')[0]);
  });
});
