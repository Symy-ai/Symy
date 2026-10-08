// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LettaActionPanel } from '../letta-action-panel';
import { adminPost } from '@/lib/admin-panel/api-client';
import type { LettaActionMeta } from '@/lib/admin-panel/types';

vi.mock('@/lib/admin-panel/api-client', () => ({
  adminPost: vi.fn(),
}));

const adminPostMock = vi.mocked(adminPost);

function makeMeta(overrides: Partial<LettaActionMeta> = {}): LettaActionMeta {
  return {
    action: 'agent.sleep',
    label: '休眠',
    description: '让 Agent 休眠',
    params: [],
    ...overrides,
  };
}

function renderPanel(meta = makeMeta(), props = {}) {
  const onToggleFavorite = vi.fn();
  render(<LettaActionPanel meta={meta} onToggleFavorite={onToggleFavorite} {...props} />);
  return { onToggleFavorite };
}

beforeEach(() => {
  adminPostMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LettaActionPanel', () => {
  it('渲染 action、描述、危险标记与空参数提示', () => {
    renderPanel(makeMeta({ dangerous: true }));

    expect(screen.getByText('agent.sleep')).toBeTruthy();
    expect(screen.getByText('让 Agent 休眠')).toBeTruthy();
    expect(screen.getByText('危险')).toBeTruthy();
    expect(screen.getByText('此操作无需参数')).toBeTruthy();
  });

  it('渲染参数控件、必填标记、默认值与帮助文本', () => {
    renderPanel(makeMeta({
      params: [
        { key: 'agent_id', label: 'Agent', type: 'string', required: true, help: '目标 Agent ID' },
        { key: 'minutes', label: '分钟', type: 'number', defaultValue: 30 },
        { key: 'verbose', label: '详细', type: 'boolean', defaultValue: true },
      ],
    }));

    expect(screen.getByRole('textbox', { name: /Agent \(agent_id\) \*/ })).toBeTruthy();
    expect(screen.getByText('目标 Agent ID')).toBeTruthy();
    expect((screen.getByRole('spinbutton', { name: /分钟 \(minutes\)/ }) as HTMLInputElement).value).toBe('30');
    expect(screen.getByText('启用')).toBeTruthy();
  });

  it('普通操作提交时发送 action 且序列化 number 与 boolean', async () => {
    adminPostMock.mockResolvedValue({ ok: true, status: 200, data: { done: true }, error: null });
    renderPanel(makeMeta({
      params: [
        { key: 'minutes', label: '分钟', type: 'number', required: true, defaultValue: 30 },
        { key: 'verbose', label: '详细', type: 'boolean', defaultValue: false },
      ],
    }));

    fireEvent.submit(screen.getByRole('button', { name: '执行' }).closest('form')!);

    await waitFor(() => expect(screen.getByText('成功')).toBeTruthy());
    expect(adminPostMock).toHaveBeenCalledWith('/api/admin/letta', {
      action: 'agent.sleep',
      minutes: 30,
      verbose: false,
    });
  });

  it('json 参数成功时解析为对象，可选空参数不发送', async () => {
    adminPostMock.mockResolvedValue({ ok: true, status: 200, data: { ok: true }, error: null });
    renderPanel(makeMeta({
      params: [
        { key: 'config', label: '配置', type: 'json', required: true, defaultValue: '{"level":2}' },
        { key: 'note', label: '备注', type: 'string' },
      ],
    }));

    fireEvent.submit(screen.getByRole('button', { name: '执行' }).closest('form')!);

    await waitFor(() => expect(screen.getByText('成功')).toBeTruthy());
    expect(adminPostMock).toHaveBeenCalledWith('/api/admin/letta', {
      action: 'agent.sleep',
      config: { level: 2 },
    });
  });

  it('必填参数为空时不请求并展示字段级错误', async () => {
    renderPanel(makeMeta({
      params: [{ key: 'agent_id', label: 'Agent', type: 'string', required: true }],
    }));

    fireEvent.submit(screen.getByRole('button', { name: '执行' }).closest('form')!);

    expect(await screen.findByText('缺少必填参数: Agent (agent_id)')).toBeTruthy();
    expect(screen.getByText('失败')).toBeTruthy();
    expect(adminPostMock).not.toHaveBeenCalled();
  });

  it('危险操作需确认后执行且确认框展示 action 与影响描述', async () => {
    adminPostMock.mockResolvedValue({ ok: true, status: 200, data: null, error: null });
    renderPanel(makeMeta({ dangerous: true }));

    fireEvent.click(screen.getByRole('button', { name: /执行（需确认）/ }));
    expect(screen.getByText('确认执行危险操作？')).toBeTruthy();
    expect(screen.getAllByText('agent.sleep').length).toBeGreaterThanOrEqual(2);
    expect(adminPostMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '确认执行' }));

    await waitFor(() => expect(adminPostMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('成功')).toBeTruthy();
  });

  it('取消危险确认不触发请求', () => {
    renderPanel(makeMeta({ dangerous: true }));

    fireEvent.click(screen.getByRole('button', { name: /执行（需确认）/ }));
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(adminPostMock).not.toHaveBeenCalled();
  });

  it('失败结果展示 API 错误与原始 json 字符串', async () => {
    adminPostMock.mockResolvedValue({ ok: false, status: 400, data: null, error: 'action 不存在' });
    renderPanel(makeMeta({
      params: [{ key: 'config', label: '配置', type: 'json', required: true, defaultValue: '{bad' }],
    }));

    fireEvent.submit(screen.getByRole('button', { name: '执行' }).closest('form')!);

    expect(await screen.findByText('action 不存在')).toBeTruthy();
    expect(screen.getByText('失败')).toBeTruthy();
    expect(adminPostMock).toHaveBeenCalledWith('/api/admin/letta', {
      action: 'agent.sleep',
      config: '{bad',
    });
  });

  it('收藏按钮回调 action，且非收藏态/收藏态 aria 区分', () => {
    const first = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '收藏' }));
    expect(first.onToggleFavorite).toHaveBeenCalledWith('agent.sleep');
    cleanup();

    const second = renderPanel(makeMeta(), { isFavorite: true });
    fireEvent.click(screen.getByRole('button', { name: '取消收藏' }));
    expect(second.onToggleFavorite).toHaveBeenCalledWith('agent.sleep');
  });
});
