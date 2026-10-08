// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string }) => {
      const map: Record<string, string> = {
        'profile.displayNameDialogTitle': '修改昵称',
        'profile.displayNameDialogDesc': '你的昵称会展示给伙伴',
        'profile.displayNamePlaceholder': '输入昵称',
        'profile.displayNameCancel': '取消',
        'profile.displayNameSave': '保存',
      };
      return map[key] ?? opts?.defaultValue ?? key;
    },
  }),
}));
vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { DisplayNameDialog } from '../display-name-dialog';
import { apiFetch } from '@/lib/api-client';

const mockApi = vi.mocked(apiFetch);

const baseProps = {
  open: true,
  initialName: '旧昵称',
  onClose: vi.fn(),
  onSaved: vi.fn(),
  onError: vi.fn(),
};

function renderUI(props: Partial<typeof baseProps> = {}) {
  return render(<DisplayNameDialog {...baseProps} {...props} />);
}

/**
 * display-name-dialog.tsx (146行) — P2-3 昵称编辑 Portal 弹窗。
 *
 * 锁定:
 * - open=false → null 不渲染
 * - open 同步 initialName 进输入框
 * - maxLength=30
 * - 空输入/纯空格 → 保存禁用
 * - 保存: POST display-name (trim 后) + onSaved; 失败 → onError
 * - Enter 快捷保存 / Escape 关闭
 * - 遮罩点击关闭 + 内容区 stopPropagation
 */
describe('DisplayNameDialog 昵称编辑弹窗', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('open=false → 不渲染', () => {
    renderUI({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('open → 初始值同步 + maxLength 30 + role=dialog', () => {
    renderUI();
    const dlg = screen.getByRole('dialog');
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    const input = screen.getByPlaceholderText('输入昵称') as HTMLInputElement;
    expect(input.value).toBe('旧昵称');
    expect(input.getAttribute('maxlength')).toBe('30');
  });

  it('空输入/纯空格 → 保存禁用; 有效输入解禁', () => {
    renderUI();
    const input = screen.getByPlaceholderText('输入昵称');
    const save = screen.getByText('保存');
    expect((save as HTMLButtonElement).disabled).toBe(false); // 初始有值
    fireEvent.change(input, { target: { value: '   ' } });
    expect((screen.getByText('保存') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: '新昵称' } });
    expect((screen.getByText('保存') as HTMLButtonElement).disabled).toBe(false);
  });

  it('保存: POST trim 后昵称 + onSaved 回调', async () => {
    mockApi.mockResolvedValueOnce({ success: true } as never);
    renderUI();
    const input = screen.getByPlaceholderText('输入昵称');
    fireEvent.change(input, { target: { value: '  新昵称  ' } });
    fireEvent.click(screen.getByText('保存'));
    await waitFor(() => expect(baseProps.onSaved).toHaveBeenCalledTimes(1));
    expect(mockApi).toHaveBeenCalledWith('/api/user/display-name', {
      method: 'POST',
      body: { displayName: '新昵称' },
    });
  });

  it('保存失败 → onError + saving 复位', async () => {
    mockApi.mockRejectedValueOnce(new Error('boom') as never);
    renderUI();
    fireEvent.click(screen.getByText('保存'));
    await waitFor(() => expect(baseProps.onError).toHaveBeenCalledTimes(1));
    expect((screen.getByText('保存') as HTMLButtonElement).disabled).toBe(false);
  });

  it('Enter 快捷保存; Escape 关闭', async () => {
    mockApi.mockResolvedValueOnce({ success: true } as never);
    renderUI();
    const input = screen.getByPlaceholderText('输入昵称');
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(mockApi).toHaveBeenCalled());
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('遮罩点击关闭 + 内容区点击不冒泡', () => {
    renderUI();
    fireEvent.click(screen.getByRole('dialog')); // 遮罩
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
    // 内容区 (标题所在容器) 点击不关
    fireEvent.click(screen.getByText('修改昵称'));
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });
});
