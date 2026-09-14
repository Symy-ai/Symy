// @vitest-environment happy-dom
/**
 * GuardianStyleWizard 设置页向导行为测试 (batch61-a)
 *
 * 验收红线:
 * - 入口汇总全部来自既有设置渠道 (overview step);
 * - 草稿式一次生效: 中途退出零写入 (本地三渠道不动、不发 PATCH);
 * - 完成后逐项写回; 微调反映到契约卡与写回结果;
 * - 推送失败诚实展示, 不伪造成功。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GuardianStyleWizard } from '../guardian-style-wizard';
import { setGuardIntensity, _resetGuardIntensityStateForTest } from '@/hooks/use-guard-intensity';
import { setNightWindow, _resetNightWindowStateForTest } from '@/hooks/use-night-window';
import { setGuardScopeMode, _resetGuardScopeStateForTest } from '@/hooks/use-guard-scope';

const { pushFrequency, pushSave } = vi.hoisted(() => ({
  pushFrequency: { current: 'weekly' as string },
  pushSave: { result: true as boolean },
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/lib/push/use-push-preferences', () => ({
  usePushPreferences: () => ({
    preferences: {
      missYou: true,
      dreamFund: true,
      challenge: true,
      weeklyGuardian: true,
      dailyAlgorithm: true,
      frequency: pushFrequency.current,
    },
    isLoaded: true,
    isSaving: false,
    justSaved: false,
    saveError: null,
    load: vi.fn(),
    save: vi.fn(async () => pushSave.result),
  }),
}));

function renderWizard(onClose: () => void = vi.fn()) {
  render(<GuardianStyleWizard onClose={onClose} />);
  return onClose;
}

function goThroughTo(step: 'style' | 'adjust' | 'contract') {
  fireEvent.click(screen.getByTestId('guardian-style-next')); // overview → style
  if (step === 'style') return;
  fireEvent.click(screen.getByTestId('guardian-style-preset-strictCoach'));
  fireEvent.click(screen.getByTestId('guardian-style-next')); // style → adjust
  if (step === 'adjust') return;
  fireEvent.click(screen.getByTestId('guardian-style-next')); // adjust → contract
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  _resetGuardIntensityStateForTest();
  _resetNightWindowStateForTest();
  _resetGuardScopeStateForTest();
  window.localStorage.clear();
  pushFrequency.current = 'weekly';
});

describe('GuardianStyleWizard overview — 汇总既有渠道', () => {
  it('现状汇总的值全部来自既有设置渠道', () => {
    setGuardIntensity('gentle');
    setNightWindow('early');
    setGuardScopeMode('food', 'exempt');
    pushFrequency.current = 'weekly';

    renderWizard();

    expect(screen.getByTestId('guardian-style-wizard')).toBeTruthy();
    expect(screen.getByTestId('guardian-style-step-overview').getAttribute('aria-current')).toBe('step');
    expect(screen.getByTestId('guardian-style-overview-intensity').getAttribute('data-value')).toBe('gentle');
    expect(screen.getByTestId('guardian-style-overview-night').getAttribute('data-value')).toBe('early');
    expect(screen.getByTestId('guardian-style-overview-push').getAttribute('data-value')).toBe('weekly');
    expect(screen.getByTestId('guardian-style-overview-scope').getAttribute('data-value')).toBe('0strict/1exempt');
  });

  it('style 步在选中预设前禁用下一步', () => {
    renderWizard();
    fireEvent.click(screen.getByTestId('guardian-style-next'));
    expect(screen.getByTestId('guardian-style-next').hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByTestId('guardian-style-preset-gentleCompanion'));
    expect(screen.getByTestId('guardian-style-preset-gentleCompanion').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('guardian-style-next').hasAttribute('disabled')).toBe(false);
  });
});

describe('GuardianStyleWizard 草稿式一次生效', () => {
  it('中途退出零写入: 本地三渠道不动, 不发 PATCH', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onClose = renderWizard();

    goThroughTo('adjust');
    fireEvent.click(screen.getByTestId('guardian-style-exit'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('symy-guard-intensity')).toBeNull();
    expect(window.localStorage.getItem('symy-night-window')).toBeNull();
    expect(window.localStorage.getItem('symy-guard-scope')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('预设 + 完成 → 四渠道逐项写回, 向导关闭, 设置原位置保持生效', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ preferences: {} }), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    const onClose = renderWizard();

    goThroughTo('contract');
    expect(screen.getByTestId('guardian-style-contract-card')).toBeTruthy();
    fireEvent.click(screen.getByTestId('guardian-style-apply'));

    await waitFor(() => expect(screen.getByTestId('guard-policy-receipt').dataset.status).toBe('saved'));
    expect(screen.getByTestId('guard-policy-receipt-title').textContent).toBe('profile.guardPolicyReceiptApplied');
    fireEvent.click(screen.getByTestId('guard-policy-receipt-close'));
    expect(onClose).toHaveBeenCalledTimes(1);

    expect(window.localStorage.getItem('symy-guard-intensity')).toBe('strict');
    expect(window.localStorage.getItem('symy-night-window')).toBe('early');
    const storedScope = JSON.parse(window.localStorage.getItem('symy-guard-scope') ?? '{}');
    expect(storedScope.food).toBe('strict');
    expect(storedScope.electronics).toBe('strict');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/push/preferences');
    expect(JSON.parse(String(init.body))).toEqual({ frequency: 'daily' });
    // 注: 测试直接渲染向导组件, onClose 由父级 (SettingsOverlay) 负责卸载,
    // 这里只断言关闭回调已触发 — 真实卸载链路由 settings-overlay.test 覆盖。
  });

  it('预设基础上微调: 调整反映到契约卡, 完成后按微调值写回', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ preferences: {} }), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    renderWizard();

    goThroughTo('adjust');
    fireEvent.click(screen.getByTestId('guardian-style-adjust-night-off'));
    fireEvent.click(screen.getByTestId('guardian-style-adjust-push-weekly'));
    fireEvent.click(screen.getByTestId('guardian-style-next'));

    expect(screen.getByTestId('guardian-style-contract-night').textContent).toBe('profile.guardianStyleContractNightOff');
    fireEvent.click(screen.getByTestId('guardian-style-apply'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(window.localStorage.getItem('symy-night-window')).toBe('off');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ frequency: 'weekly' });
  });
});

describe('GuardianStyleWizard 推送写回失败的诚实态', () => {
  it('PATCH 500 → 展示失败说明, 不关闭向导, 可重试; 退出头部仍可关闭', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 500 })));
    vi.stubGlobal('fetch', fetchMock);
    const onClose = renderWizard();

    goThroughTo('contract');
    fireEvent.click(screen.getByTestId('guardian-style-apply'));

    await waitFor(() => expect(screen.getByTestId('guardian-style-apply-note')).toBeTruthy());
    expect(screen.getByTestId('guard-policy-receipt').dataset.status).toBe('incomplete');
    expect(onClose).not.toHaveBeenCalled();
    // 本地三项已生效 (完成已发生, 只是节奏没同步), 失败说明如实呈现
    expect(window.localStorage.getItem('symy-guard-intensity')).toBe('strict');
    // 重试: 再次点击完成后成功
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ preferences: {} }), { status: 200 }));
    fireEvent.click(screen.getByTestId('guardian-style-apply'));
    await waitFor(() => expect(screen.getByTestId('guard-policy-receipt').dataset.status).toBe('saved'));
  });

  it('PATCH 409 (推送未订阅) → 展示说明, 按钮变关闭, 点击后关闭', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 409 })));
    vi.stubGlobal('fetch', fetchMock);
    const onClose = renderWizard();

    goThroughTo('contract');
    fireEvent.click(screen.getByTestId('guardian-style-apply'));

    await waitFor(() => expect(screen.getByTestId('guardian-style-close')).toBeTruthy());
    expect(screen.getByTestId('guardian-style-apply-note')).toBeTruthy();
    expect(window.localStorage.getItem('symy-guard-intensity')).toBe('strict');
    fireEvent.click(screen.getByTestId('guardian-style-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('GuardianStyleWizard 策略回执恢复', () => {
  it('restore writes the exact previous snapshot through existing channels', async () => {
    pushSave.result = true;
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ preferences: {} }), { status: 200 }))));
    setGuardIntensity('gentle');
    setNightWindow('standard');
    setGuardScopeMode('beauty', 'exempt');
    renderWizard();

    goThroughTo('contract');
    fireEvent.click(screen.getByTestId('guardian-style-apply'));
    await waitFor(() => expect(screen.getByTestId('guard-policy-receipt').dataset.status).toBe('saved'));

    fireEvent.click(screen.getByTestId('guard-policy-restore'));
    await waitFor(() => expect(screen.getByTestId('guard-policy-receipt').dataset.status).toBe('restored'));
    expect(window.localStorage.getItem('symy-guard-intensity')).toBe('gentle');
    expect(window.localStorage.getItem('symy-night-window')).toBe('standard');
    expect(JSON.parse(String(window.localStorage.getItem('symy-guard-scope'))).beauty).toBe('exempt');
  });
});
