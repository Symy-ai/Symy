// @vitest-environment happy-dom
/**
 * admin/page.tsx (386行) — Dashboard 仪表盘主入口。
 *
 * R431 v7-c 侦察开档 (src 全域兜底扫描出的最大未测件)。
 *
 * 锁定:
 * - 挂载并行五管道 (allSettled 单败不塌)
 * - letta 失败 → 部分失败横幅 + 其余卡片照渲染
 * - 数字卡/审计时间线渲染
 * - 60s 静默自动刷新 interval 挂载 + 卸载清理
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const adminGetMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/admin-panel/api-client', () => ({
  adminGet: adminGetMock,
  adminPost: vi.fn(),
}));

// Link → 普通 a
vi.mock('next/link', () => ({
  default: (props: { href: string; children: React.ReactNode }) => <a href={props.href}>{props.children}</a>,
}));

import AdminDashboardPage from '../page';

function ok(data: unknown) {
  return { ok: true, data };
}
function fail() {
  return { ok: false, data: null };
}

describe('AdminDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminGetMock.mockReset();
    // 默认五管道全 ok
    adminGetMock.mockImplementation((path: string) => {
      if (path === '/api/admin/letta') {
        return Promise.resolve(ok({ agents: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }], agentCount: 3, mcpServers: [{ id: 'm1' }] }));
      }
      if (path === '/api/admin/agent-pool') return ok({ poolSize: 5, activeAgents: 4 });
      if (path === '/api/admin/audit?action=stats') return ok({ totalLogs: 100, todayLogs: 12 });
      if (path === '/api/admin/cultivation?action=stats') return ok({ totalAssessments: 50 });
      if (path === '/api/admin/embeddings?action=stats') return ok({ totalEmbeddings: 200 });
      if (path === '/api/admin/audit?page=1&limit=5') {
        return Promise.resolve(ok({ logs: [{ id: 'l1', action: 'ban', actor: 'admin', created_at: '2026-10-01T00:00:00Z' }] }));
      }
      return Promise.resolve(ok({}));
    });
  });
  afterEach(() => vi.useRealTimers());

  it('挂载即并行拉五管道 + 数字卡渲染 (agentCount=3)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<AdminDashboardPage />);
    await waitFor(() => expect(screen.getByText('Letta Agent')).toBeTruthy());
    // 五管道都被调
    const calls = adminGetMock.mock.calls.map((c) => c[0]);
    expect(calls).toContain('/api/admin/letta');
    expect(calls).toContain('/api/admin/agent-pool');
    expect(calls).toContain('/api/admin/audit?action=stats');
    expect(calls).toContain('/api/admin/cultivation?action=stats');
    expect(calls).toContain('/api/admin/embeddings?action=stats');
    expect(calls).toContain('/api/admin/audit?page=1&limit=5');
    // 数字
    expect(screen.getByText('3')).toBeTruthy();
    // 审计时间线日志渲染
    expect(screen.getByText('ban')).toBeTruthy();
    // 无错误横幅
    expect(screen.queryByText(/部分数据加载失败/)).toBeNull();
  });

  it('letta 单管道失败 → 部分失败横幅 + 其余数据照常渲染 (allSettled 韧性锚)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    adminGetMock.mockImplementation((path: string) => {
      if (path === '/api/admin/letta') return Promise.resolve(fail());
      if (path === '/api/admin/audit?action=stats') return Promise.resolve(ok({ totalLogs: 77 }));
      return Promise.resolve(ok({}));
    });
    render(<AdminDashboardPage />);
    await waitFor(() => expect(screen.getByText(/部分数据加载失败/)).toBeTruthy());
    // 其余照渲染
    expect(screen.getByText('Letta Agent')).toBeTruthy();
  });

  it('60s 静默自动刷新 (挂载 interval + 卸载清理)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { unmount } = render(<AdminDashboardPage />);
    await waitFor(() => expect(screen.getByText('Letta Agent')).toBeTruthy());
    const callsAfterMount = adminGetMock.mock.calls.length;
    // 推进 61s → 至少再拉一轮
    await vi.advanceTimersByTimeAsync(61_000);
    expect(adminGetMock.mock.calls.length).toBeGreaterThan(callsAfterMount);
    // 卸载后清理: 再推进不再拉
    const callsBeforeUnmount = adminGetMock.mock.calls.length;
    unmount();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(adminGetMock.mock.calls.length).toBe(callsBeforeUnmount);
  });

  it('手动刷新按钮 → 再拉一轮', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<AdminDashboardPage />);
    // 等 loading 结束 (按钮解锁) 再点
    const refreshBtn = await waitFor(() => {
      const btn = screen.getByText('刷新').closest('button') as HTMLButtonElement;
      if (btn.disabled) throw new Error('still loading');
      return btn;
    });
    const before = adminGetMock.mock.calls.length;
    fireEvent.click(refreshBtn);
    await waitFor(() => expect(adminGetMock.mock.calls.length).toBeGreaterThan(before));
  });
});
