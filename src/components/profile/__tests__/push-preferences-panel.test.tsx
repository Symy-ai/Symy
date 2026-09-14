// @vitest-environment happy-dom
/**
 * PushPreferencesPanel 组件测试 (batch60-b)
 *
 * 覆盖: 频率三档 + 四类型开关渲染、点击上抛 patch、禁用态不吃交互、
 * off 说明行 (只停提醒不丢记录)、"已更新" 轻反馈。
 * 文案红线: 面板全串零金额字符。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PushPreferencesPanel } from '../push-preferences-panel';
import { DEFAULT_PUSH_PREFERENCES } from '@/lib/push/preferences';

const MESSAGES: Record<string, string> = {
  'profile.pushPrefsTitle': '推送偏好',
  'profile.pushPrefsFrequencyLabel': '提醒节奏',
  'profile.pushPrefsFrequencyDaily': '每天',
  'profile.pushPrefsFrequencyWeekly': '每周',
  'profile.pushPrefsFrequencyOff': '关闭',
  'profile.pushPrefsFrequencyDailyDesc': '每日一条算法拆解。',
  'profile.pushPrefsFrequencyWeeklyDesc': '每周一封守护周报。',
  'profile.pushPrefsFrequencyOffDesc': '例行提醒静默。',
  'profile.pushPrefsOffNote': '关闭只是停止提醒，守护记录都还在。',
  'profile.pushPrefsMissYouLabel': '想念我',
  'profile.pushPrefsMissYouDesc': '几天没来时的一声问候。',
  'profile.pushPrefsDreamFundLabel': '梦想基金',
  'profile.pushPrefsDreamFundDesc': '里程碑各报一次。',
  'profile.pushPrefsChallengeLabel': '挑战结算',
  'profile.pushPrefsChallengeDesc': '挑战成功后的荣誉时刻。',
  'profile.pushPrefsWeeklyGuardianLabel': '守护周报',
  'profile.pushPrefsWeeklyGuardianDesc': '每周一战报。',
  'profile.pushPrefsSaved': '已更新',
};

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ t: (key: string) => MESSAGES[key] || key }),
}));

const noopT = (key: string) => MESSAGES[key] || key;

afterEach(() => cleanup());

describe('PushPreferencesPanel', () => {
  it('renders three rhythm options with daily selected by default', () => {
    render(<PushPreferencesPanel t={noopT} preferences={DEFAULT_PUSH_PREFERENCES} onChange={vi.fn()} />);

    expect(screen.getByTestId('push-prefs-frequency-daily').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('push-prefs-frequency-weekly').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('push-prefs-frequency-off').getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByTestId('push-prefs-off-note')).toBeNull();
  });

  it('raises frequency patches and per-type toggle patches', () => {
    const onChange = vi.fn();
    render(<PushPreferencesPanel t={noopT} preferences={DEFAULT_PUSH_PREFERENCES} onChange={onChange} />);

    fireEvent.click(screen.getByTestId('push-prefs-frequency-weekly'));
    expect(onChange).toHaveBeenLastCalledWith({ frequency: 'weekly' });

    fireEvent.click(screen.getByTestId('push-prefs-toggle-dreamFund'));
    expect(onChange).toHaveBeenLastCalledWith({ dreamFund: false });

    fireEvent.click(screen.getByTestId('push-prefs-toggle-weeklyGuardian'));
    expect(onChange).toHaveBeenLastCalledWith({ weeklyGuardian: false });
  });

  it('shows the off note when frequency is off (只停提醒, 记录不丢)', () => {
    render(
      <PushPreferencesPanel
        t={noopT}
        preferences={{ ...DEFAULT_PUSH_PREFERENCES, frequency: 'off' }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('push-prefs-off-note').textContent).toContain('守护记录');
  });

  it('disables interactions without losing displayed values', () => {
    const onChange = vi.fn();
    render(
      <PushPreferencesPanel
        t={noopT}
        preferences={{ ...DEFAULT_PUSH_PREFERENCES, missYou: false, frequency: 'weekly' }}
        onChange={onChange}
        disabled
      />,
    );

    const missYou = screen.getByTestId('push-prefs-toggle-missYou');
    expect(missYou.hasAttribute('disabled')).toBe(true);
    expect(missYou.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(missYou);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the saved feedback only when asked, and never emits money characters', () => {
    const { rerender } = render(<PushPreferencesPanel t={noopT} preferences={DEFAULT_PUSH_PREFERENCES} onChange={vi.fn()} />);
    expect(screen.queryByTestId('push-prefs-saved')).toBeNull();

    rerender(<PushPreferencesPanel t={noopT} preferences={DEFAULT_PUSH_PREFERENCES} onChange={vi.fn()} justSaved />);
    expect(screen.getByTestId('push-prefs-saved').textContent).toBe('已更新');

    expect(JSON.stringify(MESSAGES)).not.toMatch(/[¥$￥]|美元|元/);
  });
});
