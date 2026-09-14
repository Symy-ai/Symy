/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GuardControlIndex } from '../guard-control-index';
import { _resetGuardIntensityStateForTest, setGuardIntensity } from '@/hooks/use-guard-intensity';
import { _resetNightWindowStateForTest, setNightWindow } from '@/hooks/use-night-window';
import { _resetGuardScopeStateForTest, setGuardScopeMode } from '@/hooks/use-guard-scope';
import type { GuardCoverageSnapshot, GuardEvidenceSnapshot } from '@/lib/guard-settings-summary';
import type { GuardPushProbe } from '@/lib/guard-settings-probes';

// i18n mock — 小字典 + {placeholder} 插值, 让渲染文本可读、可断言隐私红线
const dict: Record<string, string> = {
  'profile.guardControlTitle': '守护总控',
  'profile.guardControlDesc': '一屏看清 Symy 怎么守护你',
  'profile.guardControlStyleLabel': '当前守护风格',
  'profile.guardControlStyleCustom': '自定义组合',
  'profile.guardControlStyleCustomHint': '进向导可一键归位',
  'profile.guardControlStyleUnknown': '暂时无法确认',
  'profile.guardControlStyleUnknownHint': '风格暂时确认不了',
  'profile.guardControlGroupChat': '对话守护',
  'profile.guardControlGroupCart': '购物车守护',
  'profile.guardControlGroupPush': '推送守护',
  'profile.guardControlGroupEvidence': '资料与证据',
  'profile.guardControlStatusOn': '已开启',
  'profile.guardControlStatusPartial': '部分生效',
  'profile.guardControlStatusOff': '已关闭',
  'profile.guardControlStatusUnknown': '暂时未知',
  'profile.guardControlGlobalOffHint': '绿色守护总开关关闭，所有守护入口均暂停',
  'profile.guardControlCoverageLabel': '绿色规则覆盖',
  'profile.guardControlCoverageHealthy': '覆盖健康',
  'profile.guardControlCoveragePartial': '有缺口',
  'profile.guardControlCoverageNoData': '暂无数据',
  'profile.guardControlCoverageNoEntries': '词库为空',
  'profile.guardControlCoverageUncovered': '{count} 个品类待补',
  'profile.guardControlChatPartialHint': '温和强度或深夜提醒关闭中',
  'profile.guardControlCartPartialHint': '{count} 个品类已豁免守护',
  'profile.guardControlPushPartialHint': '部分提醒通道或节奏已调低',
  'profile.guardControlEvidencePartialHint': '守护记录还不多',
  'profile.guardControlRetry': '重新检查',
  'profile.guardControlJumpAria': '跳转到{group}设置',
  'profile.guardianStylePresetBalancedGuard': '均衡守护',
  'profile.guardianStylePresetBalancedGuardDesc': '默认的均衡守护',
  'profile.guardianStylePresetGentleCompanion': '温柔陪伴',
  'profile.guardianStylePresetGentleCompanionDesc': '温和的陪伴',
  'profile.guardianStylePresetStrictCoach': '严格教练',
  'profile.guardianStylePresetStrictCoachDesc': '严格的教练',
  'profile.guardianStylePresetNightLightGuard': '夜间轻守',
  'profile.guardianStylePresetNightLightGuardDesc': '夜间的轻守',
};

const t = (key: string, values?: Record<string, string | number>) => {
  const template = dict[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(values?.[name] ?? `{${name}}`));
};

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ t, locale: 'zh', setLocale: vi.fn() }),
}));

// push 订阅态 — 浏览器侧状态, 测试里直接给定
const pushImpl = { isSubscribed: true };
vi.mock('@/lib/push/use-push-notifications', () => ({
  usePushNotifications: () => ({
    isSupported: true,
    isSubscribed: pushImpl.isSubscribed,
    isLoading: false,
    error: null,
    subscribe: vi.fn(() => Promise.resolve(true)),
    unsubscribe: vi.fn(() => Promise.resolve(true)),
  }),
}));

// 数据探测 — 全部可编程, 不发真实网络请求
const probeImpl = {
  coverage: vi.fn(),
  evidence: vi.fn(),
  push: vi.fn(),
};
vi.mock('@/lib/guard-settings-probes', () => ({
  loadGuardCoverageProbe: (force?: boolean) => probeImpl.coverage(force),
  loadGuardEvidenceProbe: (force?: boolean) => probeImpl.evidence(force),
  loadGuardPushProbe: (force?: boolean) => probeImpl.push(force),
}));

const COVERAGE_OK: GuardCoverageSnapshot = { health: 'healthy', uncoveredCategories: 0 };
const EVIDENCE_OK: GuardEvidenceSnapshot = { totalEvents: 9 };
const PUSH_OK: GuardPushProbe = {
  frequency: 'daily',
  channels: { missYou: true, dreamFund: true, challenge: true, weeklyGuardian: true },
};

function resetProbeDefaults() {
  probeImpl.coverage.mockReturnValue(Promise.resolve({ ...COVERAGE_OK }));
  probeImpl.evidence.mockReturnValue(Promise.resolve({ ...EVIDENCE_OK }));
  probeImpl.push.mockReturnValue(Promise.resolve({ ...PUSH_OK }));
}

describe('GuardControlIndex — 状态矩阵', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    pushImpl.isSubscribed = true;
    resetProbeDefaults();
  });

  afterEach(() => {
    _resetGuardIntensityStateForTest();
    _resetNightWindowStateForTest();
    _resetGuardScopeStateForTest();
    window.localStorage.clear();
  });

  it('全默认场景: 风格命中均衡守护, 四组全 on, 覆盖健康, 无重试按钮', async () => {
    render(<GuardControlIndex greenGuardEnabled />);
    await waitFor(() => {
      expect(screen.getByTestId('guard-control-group-chat').getAttribute('data-status')).toBe('on');
    });
    expect(screen.getByTestId('guard-control-style').getAttribute('data-style')).toBe('preset');
    expect(screen.getByTestId('guard-control-style').textContent).toContain('均衡守护');
    expect(screen.getByTestId('guard-control-group-cart').getAttribute('data-status')).toBe('on');
    expect(screen.getByTestId('guard-control-group-push').getAttribute('data-status')).toBe('on');
    expect(screen.getByTestId('guard-control-group-evidence').getAttribute('data-status')).toBe('on');
    expect(screen.getByTestId('guard-control-coverage').getAttribute('data-health')).toBe('healthy');
    expect(screen.queryByTestId('guard-control-retry')).toBeNull();
  });

  it('对话守护: 总开关关 → off; 开启后走温和强度 → partial 带提示', async () => {
    const { rerender } = render(<GuardControlIndex greenGuardEnabled={false} />);
    await waitFor(() => {
      expect(screen.getByTestId('guard-control-group-chat').getAttribute('data-status')).toBe('off');
    });
    for (const group of ['cart', 'push', 'evidence'] as const) {
      expect(screen.getByTestId(`guard-control-group-${group}`).getAttribute('data-status')).toBe('off');
      expect(screen.getByTestId(`guard-control-group-${group}`).textContent).toContain('绿色守护总开关关闭');
    }

    rerender(<GuardControlIndex greenGuardEnabled />);
    await waitFor(() => {
      expect(screen.getByTestId('guard-control-group-chat').getAttribute('data-status')).toBe('on');
    });

    setGuardIntensity('gentle');
    await waitFor(() => {
      expect(screen.getByTestId('guard-control-group-chat').getAttribute('data-status')).toBe('partial');
    });
    expect(screen.getByTestId('guard-control-group-chat').textContent).toContain('温和强度或深夜提醒关闭中');

    setGuardIntensity('balanced');
    setNightWindow('off');
    await waitFor(() => {
      expect(screen.getByTestId('guard-control-group-chat').getAttribute('data-status')).toBe('partial');
    });
  });

  it('购物车守护: 豁免两品类 → partial 带计数; 逐个豁免至全部 → off', async () => {
    render(<GuardControlIndex greenGuardEnabled />);
    await waitFor(() => {
      expect(screen.getByTestId('guard-control-group-cart').getAttribute('data-status')).toBe('on');
    });

    setGuardScopeMode('home', 'exempt');
    setGuardScopeMode('food', 'exempt');
    await waitFor(() => {
      expect(screen.getByTestId('guard-control-group-cart').getAttribute('data-status')).toBe('partial');
    });
    expect(screen.getByTestId('guard-control-group-cart').textContent).toContain('2 个品类已豁免守护');

    setGuardScopeMode('electronics', 'exempt');
    setGuardScopeMode('clothing', 'exempt');
    setGuardScopeMode('beauty', 'exempt');
    await waitFor(() => {
      expect(screen.getByTestId('guard-control-group-cart').getAttribute('data-status')).toBe('off');
    });
  });

  it('推送守护: 未订阅 off; 订阅但通道部分关 partial', async () => {
    pushImpl.isSubscribed = false;
    const { unmount } = render(<GuardControlIndex greenGuardEnabled />);
    await waitFor(() => {
      expect(screen.getByTestId('guard-control-group-push').getAttribute('data-status')).toBe('off');
    });
    unmount();

    pushImpl.isSubscribed = true;
    probeImpl.push.mockReturnValue(
      Promise.resolve({ frequency: 'daily', channels: { missYou: true, dreamFund: true, challenge: false, weeklyGuardian: true } }),
    );
    render(<GuardControlIndex greenGuardEnabled />);
    await waitFor(() => {
      expect(screen.getByTestId('guard-control-group-push').getAttribute('data-status')).toBe('partial');
    });
    expect(screen.getByTestId('guard-control-group-push').textContent).toContain('部分提醒通道或节奏已调低');
  });

  it('资料与证据: 记录稀疏 partial 带提示, 空记录 off', async () => {
    probeImpl.evidence.mockReturnValue(Promise.resolve({ totalEvents: 2 }));
    const { unmount } = render(<GuardControlIndex greenGuardEnabled />);
    await waitFor(() => {
      expect(screen.getByTestId('guard-control-group-evidence').getAttribute('data-status')).toBe('partial');
    });
    expect(screen.getByTestId('guard-control-group-evidence').textContent).toContain('守护记录还不多');
    unmount();

    probeImpl.evidence.mockReturnValue(Promise.resolve({ totalEvents: 0 }));
    render(<GuardControlIndex greenGuardEnabled />);
    await waitFor(() => {
      expect(screen.getByTestId('guard-control-group-evidence').getAttribute('data-status')).toBe('off');
    });
  });

  it('守护风格: 范围偏离预设 → custom; 覆盖有缺口 → 级别 + 未覆盖品类数', async () => {
    probeImpl.coverage.mockReturnValue(Promise.resolve({ health: 'partial', uncoveredCategories: 3 }));
    render(<GuardControlIndex greenGuardEnabled />);
    await waitFor(() => {
      expect(screen.getByTestId('guard-control-coverage').getAttribute('data-health')).toBe('partial');
    });
    expect(screen.getByTestId('guard-control-coverage').textContent).toContain('有缺口');
    expect(screen.getByTestId('guard-control-coverage').textContent).toContain('3 个品类待补');
    expect(screen.getByTestId('guard-control-style').getAttribute('data-style')).toBe('preset');

    setGuardScopeMode('food', 'exempt');
    await waitFor(() => {
      expect(screen.getByTestId('guard-control-style').getAttribute('data-style')).toBe('custom');
    });
  });
});

describe('GuardControlIndex — 降级与轻试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pushImpl.isSubscribed = true;
    resetProbeDefaults();
  });

  afterEach(() => {
    _resetGuardIntensityStateForTest();
    _resetNightWindowStateForTest();
    _resetGuardScopeStateForTest();
    window.localStorage.clear();
  });

  it('任一探测 reject: 该维度 unknown + 风格 unknown, 其他组照常, 重试强刷后恢复', async () => {
    probeImpl.push.mockReturnValue(Promise.reject(new Error('push probe failed')));
    render(<GuardControlIndex greenGuardEnabled />);

    await waitFor(() => {
      expect(screen.getByTestId('guard-control-group-push').getAttribute('data-status')).toBe('unknown');
    });
    expect(screen.getByTestId('guard-control-style').getAttribute('data-style')).toBe('unknown');
    expect(screen.getByTestId('guard-control-group-chat').getAttribute('data-status')).toBe('on');
    expect(screen.getByTestId('guard-control-group-cart').getAttribute('data-status')).toBe('on');
    expect(screen.getByTestId('guard-control-group-evidence').getAttribute('data-status')).toBe('on');
    expect(screen.getByTestId('guard-control-retry')).toBeDefined();

    probeImpl.push.mockReturnValue(Promise.resolve({ ...PUSH_OK }));
    fireEvent.click(screen.getByTestId('guard-control-retry'));
    await waitFor(() => {
      expect(screen.getByTestId('guard-control-group-push').getAttribute('data-status')).toBe('on');
    });
    expect(screen.getByTestId('guard-control-style').getAttribute('data-style')).toBe('preset');
    expect(probeImpl.push).toHaveBeenCalledWith(true);
    expect(screen.queryByTestId('guard-control-retry')).toBeNull();
  });
});

describe('GuardControlIndex — 锚点跳转与可达性', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pushImpl.isSubscribed = true;
    resetProbeDefaults();
  });

  afterEach(() => {
    _resetGuardIntensityStateForTest();
    _resetNightWindowStateForTest();
    _resetGuardScopeStateForTest();
    window.localStorage.clear();
    document.body.innerHTML = '';
  });

  it('分组行是原生 button, 点击滚动到锚点并移交焦点 (键盘可达)', async () => {
    const target = document.createElement('div');
    target.id = 'guard-anchor-chat';
    const focusSpy = vi.spyOn(target, 'focus').mockImplementation(() => {});
    document.body.appendChild(target);

    render(<GuardControlIndex greenGuardEnabled />);
    const row = screen.getByTestId('guard-control-group-chat');
    expect(row.tagName).toBe('BUTTON');
    expect(row.className).toContain('focus:ring-2');
    expect(row.getAttribute('aria-label')).toBe('跳转到对话守护设置');

    await waitFor(() => expect(row.getAttribute('data-status')).toBe('on'));
    fireEvent.click(row);

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('隐私红线: 渲染文本零金额、零碳数值、零百分比', async () => {
    setGuardScopeMode('food', 'exempt');
    probeImpl.coverage.mockReturnValue(Promise.resolve({ health: 'partial', uncoveredCategories: 2 }));
    const { container } = render(<GuardControlIndex greenGuardEnabled />);
    await waitFor(() => {
      expect(screen.getByTestId('guard-control-coverage').getAttribute('data-health')).toBe('partial');
    });
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/[¥$￥€£%％]|USD|CNY|RMB|dollars?|cents?|美元|人民币|块钱|元/);
    expect(text).not.toMatch(/碳|CO2|CO₂|[0-9]+\s*kg/i);
    expect(text).toContain('1 个品类已豁免守护');
  });
});
