// @vitest-environment happy-dom

import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'u-1', email: 'a@b.c' } }),
}));
const stableT = (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key;
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));
const fetchCalls: Array<[string, unknown?]> = [];
vi.mock('@/lib/api-client', () => ({
  apiFetch: (url: string, init?: unknown) => {
    fetchCalls.push([url, init]);
    if (url === '/api/email/status') return Promise.resolve({ connections: [{ id: 'c1' }] });
    if (url === '/api/challenge/limit') return Promise.resolve({ isPremium: true });
    if (url.includes('refunded')) return Promise.resolve({ receipts: [{ id: 'r2' }] });
    if (url.startsWith('/api/email/receipts')) return Promise.resolve({ receipts: [{ id: 'r1' }] });
    return Promise.resolve({});
  },
  apiFetchVoid: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { useProfileData } from '../use-profile-data';

function Probe() {
  const d = useProfileData({ showPremiumToastMsg: vi.fn() });
  return (
    <div>
      <span data-testid="plan">{d.profile.plan}</span>
      <span data-testid="emailEnabled">{String(d.isEmailMonitorEnabled)}</span>
      <span data-testid="connections">{d.emailConnections.length}</span>
      <span data-testid="receipts">{d.uniqueReceipts.length}</span>
    </div>
  );
}

/**
 * use-profile-data.ts (98行) — profile 数据 hook (File Split Wave 1)。
 *
 * 锁定:
 * - 三请求: email/status + challenge/limit + receipts 双 status
 * - isPremium → plan=premium → 邮箱监控解锁 (VIP 内测门)
 * - Round 22 H4: receipts 用 allSettled (部分成功仍显示)
 */
describe('useProfileData', () => {
  beforeEach(() => fetchCalls.splice(0));

  it('挂载即拉: status+limit+双 receipts 四请求', async () => {
    render(<Probe />);
    await waitFor(() => expect(fetchCalls.length).toBeGreaterThanOrEqual(4));
    const urls = fetchCalls.map((c) => c[0]);
    expect(urls).toContain('/api/email/status');
    expect(urls).toContain('/api/challenge/limit');
    expect(urls.filter((u) => u.startsWith('/api/email/receipts'))).toHaveLength(2);
  });

  it('isPremium → plan=premium → 邮箱监控解锁', async () => {
    render(<Probe />);
    await waitFor(() => expect(document.querySelector('[data-testid="plan"]')?.textContent).toBe('premium'));
    expect(document.querySelector('[data-testid="emailEnabled"]')?.textContent).toBe('true');
  });

  it('connections 渲染', async () => {
    render(<Probe />);
    await waitFor(() => expect(document.querySelector('[data-testid="connections"]')?.textContent).toBe('1'));
  });

  it('Round 22 H4: receipts allSettled 双 status 聚合', async () => {
    render(<Probe />);
    await waitFor(() => expect(document.querySelector('[data-testid="receipts"]')?.textContent).toBe('2'));
  });
});
