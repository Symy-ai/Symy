// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string }) => {
      const map: Record<string, string> = {
        'chat.activeGuards.sos.title': '快撑不住了吗?',
        'chat.activeGuards.closeBtn': '关闭',
        'chat.activeGuards.sos.lead': '深呼吸, 我们一起看看。',
        'chat.activeGuards.sos.hold': '再撑 {hours} 小时',
        'chat.activeGuards.sos.alt': '换个替代',
        'chat.activeGuards.sos.release': '放过自己',
        'chat.activeGuards.sos.done.hold': '再撑一下, 你比自己想的更稳。',
        'chat.activeGuards.sos.done.alt': '换个思路, 也很好。',
        'chat.activeGuards.sos.done.release': '放过自己, 也是一种守护。',
      };
      let v = map[key] ?? opts?.defaultValue ?? key;
      if (opts && 'hours' in opts && opts.hours) v = v.replace('{hours}', String(opts.hours));
      return v;
    },
  }),
}));
vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn(() => Promise.resolve({})) }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/use-guard-intensity', () => ({ useGuardIntensity: () => ({ guardIntensity: 'balanced' }) }));
vi.mock('@/lib/green-commitment', () => ({ dateKeyOf: () => '2026-10-09' }));
vi.mock('@/lib/guard-sos', () => ({
  buildGuardSosTurn: () => ({
    leadKey: 'chat.activeGuards.sos.lead',
    hoursLeft: 2,
    options: [
      { id: 'hold', labelKey: 'chat.activeGuards.sos.hold' },
      { id: 'alt', labelKey: 'chat.activeGuards.sos.alt' },
      { id: 'release', labelKey: 'chat.activeGuards.sos.release' },
    ],
  }),
  buildGuardSosMetadata: (kind: string, key: string, choice: string) => ({ kind, key, choice }),
}));
vi.mock('lucide-react', (importOriginal) => importOriginal());

import { ActiveGuardsSos } from '../active-guards-sos';
import { apiFetch } from '@/lib/api-client';

const mockApi = vi.mocked(apiFetch);

const baseProps = {
  refKind: 'challenge' as const,
  refKey: 'ch-1',
  hoursLeft: 2,
  onClose: vi.fn(),
};

/**
 * active-guards-sos.tsx (108行) — SOS 降温对话 (batch59-a)。
 *
 * 锁定:
 * - 标题 + 三档回应按钮 (跟随 intensity turn)
 * - 选择 → POST health-events (manual_adjustment + metadata)
 * - 选择后收尾暖句 (done.testid) 替代按钮组
 * - 上报失败静默 (暖句照常)
 * - 防连点 (chosen 后再点无效)
 * - 关闭按钮
 */
describe('ActiveGuardsSos 降温对话', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('标题 + 三档按钮渲染', () => {
    render(<ActiveGuardsSos {...baseProps} />);
    expect(screen.getByText('快撑不住了吗?')).toBeTruthy();
    expect(screen.getByText('再撑 2 小时')).toBeTruthy();
    expect(screen.getByText('换个替代')).toBeTruthy();
    expect(screen.getByText('放过自己')).toBeTruthy();
  });

  it('选择 → POST body 四字段 (manual_adjustment+triggerSource manual)', async () => {
    render(<ActiveGuardsSos {...baseProps} />);
    act(() => { fireEvent.click(screen.getByText('放过自己')); });
    await waitFor(() => expect(mockApi).toHaveBeenCalledTimes(1));
    const [url, init] = mockApi.mock.calls[0] as [string, { method?: string; body?: Record<string, unknown> }];
    expect(url).toBe('/api/buddy/health-events');
    expect(init.method).toBe('POST');
    expect(init.body).toMatchObject({
      eventType: 'manual_adjustment',
      triggerSource: 'manual',
      metadata: { kind: 'challenge', key: 'ch-1', choice: 'release' },
    });
  });

  it('选择后收尾暖句替代按钮组 (release 档文案)', async () => {
    render(<ActiveGuardsSos {...baseProps} />);
    act(() => { fireEvent.click(screen.getByText('放过自己')); });
    await waitFor(() => expect(screen.getByTestId('active-guards-sos-done').textContent).toContain('放过自己, 也是一种守护'));
    expect(screen.queryByText('再撑 2 小时')).toBeNull(); // 按钮组消失
  });

  it('上报失败 → 静默, 暖句照常 (red-line: 不弹错不阻塞)', async () => {
    mockApi.mockRejectedValueOnce(new Error('net') as never);
    render(<ActiveGuardsSos {...baseProps} />);
    act(() => { fireEvent.click(screen.getByText('换个替代')); });
    await waitFor(() => expect(screen.getByTestId('active-guards-sos-done').textContent).toContain('换个思路'));
  });

  it('防连点: 已选后再点零追加 POST', async () => {
    render(<ActiveGuardsSos {...baseProps} />);
    act(() => { fireEvent.click(screen.getByText('再撑 2 小时')); });
    await waitFor(() => expect(mockApi).toHaveBeenCalledTimes(1));
    // 选后按钮组消失 — 无处可点, mock 仍 1 次 (UI 层防连点成立)
    expect(screen.queryByText('放过自己')).toBeNull();
    expect(mockApi).toHaveBeenCalledTimes(1);
  });

  it('关闭按钮 → onClose', () => {
    render(<ActiveGuardsSos {...baseProps} />);
    act(() => { fireEvent.click(screen.getByLabelText('关闭')); });
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });
});
