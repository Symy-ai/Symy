/**
 * Component/unit tests for GrowthMilestoneOverlay (batch5-b)
 *
 * 覆盖矩阵:
 *  - resolveStageTransition 纯函数: 基线/升阶/跨级/持平/降阶 (高水位只升不降)
 *  - 首次观测只建基线, 不给存量进度补发庆祝
 *  - 升阶触发全屏庆祝: 弹层含阶段称号 + 熊二式祝贺 + app 内省钱行 (仅自己可见)
 *  - 同一跃迁只弹一次: 关闭/重挂载后不再弹 (localStorage 持久化, 出现瞬间即落盘)
 *  - 降阶绝不弹层, 且高水位保证回落再升回同一阶段也不重复庆祝 (荣誉非羞辱)
 *  - isLoading fallback 数据 (恒 baby) 不参与检测, 防刷新假庆祝
 *  - 「晒一下」走既有 ShareModal streak 模板: 分享面 props 无格式化金额
 *    (savedCents 机器分制只喂 modal 私密提示行 — share-modal-templates 测试
 *    已保证模板卡子树无金额, 此处保证调用方不新增金额通道)
 *  - i18n: buddy.growth.milestone.* en/zh 齐全 + savedLine 占位符 + 禁碳足迹红线
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GrowthMilestoneOverlay, resolveStageTransition, readSeenStage } from '../growth-milestone-overlay';
import type { BuddyState, GrowthStage } from '@/types/buddy-state';
import en from '../../../i18n/messages/en.json';
import zh from '../../../i18n/messages/zh.json';

const { shareSpy } = vi.hoisted(() => ({ shareSpy: vi.fn() }));

// ShareModal 桩 — 只记录 props 不渲染 (导出面无金额断言的数据来源)
vi.mock('@/components/share/share-modal', () => ({
  ShareModal: (props: Record<string, unknown>) => {
    shareSpy(props);
    return null;
  },
}));

// formatCurrency 桩 — 确定性 "$1,234" (隔离 locale 模块状态)
vi.mock('@/lib/format', () => ({
  formatCurrency: (amount: number) => `$${Math.round(amount).toLocaleString('en-US')}`,
}));

// i18n 桩 — 真实文案语义 + {amount} 插值, 未知 key 原样返回
const DICT: Record<string, string> = {
  'buddy.growthStage.baby': 'Baby Elephant',
  'buddy.growthStage.young': 'Young Elephant',
  'buddy.growthStage.adult': 'Adult Elephant',
  'buddy.growthStage.elder': 'Guardian Elder',
  'buddy.growthStageDesc.baby': 'Just setting out.',
  'buddy.growthStageDesc.young': 'Growing fast.',
  'buddy.growthStageDesc.adult': 'A steady green companion.',
  'buddy.growthStageDesc.elder': 'Guardian Elder.',
  'buddy.growth.milestone.ariaLabel': 'Symy reached a new growth stage',
  'buddy.growth.milestone.eyebrow': 'Growth moment',
  'buddy.growth.milestone.blessing': 'Every bit of this growth came from money you really kept. Thank you for growing with me.',
  'buddy.growth.milestone.savedLine': 'Along the way, you\'ve kept {amount}',
  'buddy.growth.milestone.privateHint': 'Only you can see this',
  'buddy.growth.milestone.shareEntry': 'Share this moment',
  'buddy.growth.milestone.continue': 'Keep going together',
};

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const tpl = DICT[key] ?? key;
      if (!params) return tpl;
      return Object.entries(params).reduce(
        (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
        tpl
      );
    },
  }),
}));

function makeBuddyState(overrides: Partial<BuddyState> = {}): BuddyState {
  return {
    vitality: 80,
    tokens: 10,
    health: 'healthy',
    level: 3,
    xp: 40,
    xpToNext: 100,
    streak: 3,
    dreamFunds: [],
    badges: [],
    totalSaved: 1234,
    challengesCompleted: 5,
    lastHealingKitAt: null,
    version: 1,
    growthStage: 'young',
    personality: 'unknown',
    intimacy: 10,
    dailyNeeds: { clarity: 50, connection: 50 },
    proactiveMessages: [],
    personalityAwakenedAt: null,
    lastActiveAt: null,
    ...overrides,
  };
}

function mountOverlay(stage: GrowthStage, props: { isLoading?: boolean; totalSaved?: number } = {}) {
  return render(
    <GrowthMilestoneOverlay
      buddyState={makeBuddyState({ growthStage: stage, totalSaved: props.totalSaved ?? 1234 })}
      isLoading={props.isLoading}
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
  shareSpy.mockClear();
});

describe('resolveStageTransition (纯函数)', () => {
  it('首次观测 (seen=null) 只建基线, 不庆祝', () => {
    expect(resolveStageTransition(null, 'adult')).toEqual({ celebrate: null, nextSeen: 'adult' });
  });

  it('升阶庆祝新阶段; 跨级庆祝最终阶段', () => {
    expect(resolveStageTransition('baby', 'young')).toEqual({ celebrate: 'young', nextSeen: 'young' });
    expect(resolveStageTransition('baby', 'elder')).toEqual({ celebrate: 'elder', nextSeen: 'elder' });
  });

  it('持平不庆祝', () => {
    expect(resolveStageTransition('young', 'young')).toEqual({ celebrate: null, nextSeen: 'young' });
  });

  it('降阶不庆祝且水位不降 (荣誉非羞辱, 高水位只升不降)', () => {
    expect(resolveStageTransition('adult', 'young')).toEqual({ celebrate: null, nextSeen: 'adult' });
  });
});

describe('GrowthMilestoneOverlay 组件', () => {
  it('首次观测只建基线, 静默写入水位不弹层', () => {
    mountOverlay('adult');
    expect(screen.queryByTestId('growth-milestone-overlay')).toBeNull();
    expect(readSeenStage()).toBe('adult');
  });

  it('升阶触发全屏庆祝: 含阶段称号 + 祝贺文案 + app 内省钱行', async () => {
    const { rerender } = mountOverlay('young');
    expect(screen.queryByTestId('growth-milestone-overlay')).toBeNull();

    rerender(
      <GrowthMilestoneOverlay buddyState={makeBuddyState({ growthStage: 'adult', totalSaved: 1234 })} />
    );

    const overlay = await screen.findByTestId('growth-milestone-overlay');
    expect(overlay.getAttribute('aria-label')).toBe('Symy reached a new growth stage');
    // 阶段称号
    expect(screen.getByTestId('growth-milestone-stage-title').textContent).toBe('Adult Elephant');
    // 熊二式祝贺
    expect(screen.getByText(/Every bit of this growth came from money you really kept/)).toBeTruthy();
    // app 内可见省钱行 (面子/里子: 钱数只在此私密行)
    expect(screen.getByTestId('growth-milestone-saved').textContent).toContain('49 小时');
    expect(screen.getByText('Only you can see this')).toBeTruthy();
    expect(readSeenStage()).toBe('adult');
  });

  it('弹层内金额只出现在私密省钱行, 不外溢', async () => {
    const { rerender } = mountOverlay('young');
    rerender(<GrowthMilestoneOverlay buddyState={makeBuddyState({ growthStage: 'adult' })} />);
    const overlay = await screen.findByTestId('growth-milestone-overlay');

    const savedLine = screen.getByTestId('growth-milestone-saved');
    expect(savedLine.textContent).toContain('49 小时');
    // 含时间量的叶子节点必须全部落在私密省钱行内 (标题/祝贺/描述等均无时间量)
    const moneyLeaves = Array.from(overlay.querySelectorAll('*')).filter(
      (el) => el.children.length === 0 && (el.textContent ?? '').includes('49 小时')
    );
    expect(moneyLeaves.length).toBeGreaterThan(0);
    expect(moneyLeaves.every((el) => savedLine.contains(el))).toBe(true);
  });

  it('同一跃迁只弹一次: 关闭后不再弹, 重挂载 (持久化水位) 也不再弹', async () => {
    const { rerender, unmount } = mountOverlay('young');
    rerender(<GrowthMilestoneOverlay buddyState={makeBuddyState({ growthStage: 'adult' })} />);
    await screen.findByTestId('growth-milestone-overlay');

    // 关闭 → 淡出退场
    fireEvent.click(screen.getByTestId('growth-milestone-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('growth-milestone-overlay')).toBeNull();
    });

    // 同一会话重挂载: prevRef 已丢, 但持久化水位拦截
    unmount();
    mountOverlay('adult');
    expect(screen.queryByTestId('growth-milestone-overlay')).toBeNull();
  });

  it('降阶绝不弹层; 回落再升回同一阶段也不重复庆祝', () => {
    const { rerender } = mountOverlay('adult'); // 基线 adult
    rerender(<GrowthMilestoneOverlay buddyState={makeBuddyState({ growthStage: 'young' })} />);
    expect(screen.queryByTestId('growth-milestone-overlay')).toBeNull();
    expect(readSeenStage()).toBe('adult'); // 水位不降

    rerender(<GrowthMilestoneOverlay buddyState={makeBuddyState({ growthStage: 'adult' })} />);
    expect(screen.queryByTestId('growth-milestone-overlay')).toBeNull(); // adult 已是基线, 不补发
  });

  it('isLoading fallback 数据 (恒 baby) 不参与检测 — 防每次刷新假庆祝', () => {
    // 加载中: fallback baby, 不得写入水位
    mountOverlay('baby', { isLoading: true });
    expect(screen.queryByTestId('growth-milestone-overlay')).toBeNull();
    expect(readSeenStage()).toBeNull();

    // 真实数据到达 (adult): 无历史水位 → 建基线不庆祝
    mountOverlay('adult');
    expect(screen.queryByTestId('growth-milestone-overlay')).toBeNull();
    expect(readSeenStage()).toBe('adult');
  });

  it('「晒一下」唤起既有 ShareModal streak 模板, 分享面 props 无格式化金额', async () => {
    const { rerender } = mountOverlay('young');
    rerender(<GrowthMilestoneOverlay buddyState={makeBuddyState({ growthStage: 'adult', totalSaved: 1234, streak: 3, challengesCompleted: 5 })} />);
    await screen.findByTestId('growth-milestone-overlay');

    fireEvent.click(screen.getByTestId('growth-milestone-share'));

    expect(shareSpy).toHaveBeenCalledTimes(1);
    const props = shareSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(props.open).toBe(true);
    expect(props.initialTemplate).toBe('streak');
    expect(props.streakDays).toBe(3);
    expect(props.interceptCount).toBe(5);
    // 导出面无金额: 传给 share 域的整个 props 序列化后不含格式化货币串
    expect(JSON.stringify(props)).not.toContain('$1,234');
    // savedCents 机器分制 — 既有私密通道 (modal 内提示行, 模板卡子树永无金额)
    expect((props.medal as { savedCents: number }).savedCents).toBe(123400);
  });
});

describe('i18n: buddy.growth.milestone.* 双语齐全 + 红线', () => {
  const MILESTONE_KEYS = [
    'ariaLabel',
    'eyebrow',
    'blessing',
    'savedLine',
    'privateHint',
    'shareEntry',
    'continue',
  ] as const;

  it('en/zh 每个key 都是非空字符串, savedLine 带 {amount} 占位符', () => {
    for (const locale of [en, zh]) {
      const milestone = (locale as typeof en).buddy.growth.milestone;
      for (const key of MILESTONE_KEYS) {
        expect(typeof milestone[key]).toBe('string');
        expect((milestone[key] as string).length).toBeGreaterThan(0);
      }
      expect(milestone.savedLine).toContain('{amount}');
    }
  });

  it('荣誉非羞辱/环保红线: 文案无碳足迹数值, 无退步羞耻表述', () => {
    const allStrings: string[] = [];
    for (const locale of [en, zh]) {
      const milestone = (locale as typeof en).buddy.growth.milestone;
      for (const key of MILESTONE_KEYS) allStrings.push(milestone[key] as string);
    }
    const joined = allStrings.join(' ');
    expect(joined).not.toMatch(/kg|CO2|碳|carbon/i);
    expect(joined.toLowerCase()).not.toMatch(/退步|regress|fell back|shame/);
  });
});
