// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AltFootprintCard, altFootprintShareLines } from '../alt-footprint-card';
import type { AltFootprintCardData } from '@/types/alt-footprint';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, values?: Record<string, string | number>) => {
      const table: Record<string, string> = {
        'chat.altFootprint.title': '我的替代足迹',
        'chat.altFootprint.totalLabel': `累计采纳 ${values?.count} 次`,
        'chat.altFootprint.recentLabel': `最近 30 天 ${values?.count} 次`,
        'chat.altFootprint.coveredLabel': `覆盖 ${values?.count} 个生活领域`,
        'chat.altFootprint.entryCount': `× ${values?.count}`,
        'chat.altFootprint.commentSteady': '替代正在慢慢成为你的习惯 🌱',
        'chat.altFootprint.commentDefault': '替代已经是你的默认选择了 🌱',
        'chat.altFootprint.privateSavedNote': `累计估算节省约 ${values?.amount}`,
        'chat.altFootprint.privateTag': '仅自己可见',
      };
      return table[key] || key;
    },
  }),
}));

const data: AltFootprintCardData = {
  public: {
    totalAdoptions: 6,
    last30Days: 3,
    categoriesCovered: 3,
    topEntries: [
      { label: '替换装', count: 3 },
      { label: '皮草', count: 2 },
      { label: '笔记本电脑', count: 1 },
    ],
  },
  private: { savedEstimate: 420 },
};

describe('AltFootprintCard', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('渲染次数/覆盖域/Top-3 替代名/小象点评', () => {
    render(<AltFootprintCard data={data} />);
    expect(screen.getByText('我的替代足迹')).toBeTruthy();
    expect(screen.getByText('累计采纳 6 次')).toBeTruthy();
    expect(screen.getByText('最近 30 天 3 次')).toBeTruthy();
    expect(screen.getByText('覆盖 3 个生活领域')).toBeTruthy();
    expect(screen.getByText(/替换装/)).toBeTruthy();
    expect(screen.getByText('替代正在慢慢成为你的习惯 🌱')).toBeTruthy();
  });

  it('≥10 次用 commentDefault 档 (身份故事: 替代已是默认)', () => {
    render(<AltFootprintCard data={{ ...data, public: { ...data.public, totalAdoptions: 12 } } } />);
    expect(screen.getByText('替代已经是你的默认选择了 🌱')).toBeTruthy();
  });

  it('App 内私享区: savedEstimate > 0 时渲染汇总一句 + 仅自己可见标注', () => {
    render(<AltFootprintCard data={data} />);
    expect(screen.getByTestId('alt-footprint-private-saved').textContent).toContain('420');
    expect(screen.getByText('仅自己可见')).toBeTruthy();
  });

  it('savedEstimate = 0 → 私享行隐藏 (无金额噪音)', () => {
    render(<AltFootprintCard data={{ ...data, private: { savedEstimate: 0 } } } />);
    expect(screen.queryByTestId('alt-footprint-private-saved')).toBeNull();
  });

  it('分享面 amount-free: 分享取数口只输出计数与替代名, 无金额 (红线测试范式)', () => {
    const share = altFootprintShareLines(data);
    expect(share.totalAdoptions).toBe(6);
    expect(share.topLabels).toEqual(['替换装', '皮草', '笔记本电脑']);
    expect(JSON.stringify(share)).not.toMatch(/saved|amount|420|\$|¥/i);
    // public 结构本身拿不到金额 (类型 + 运行时双保险)
    expect(JSON.stringify(data.public)).not.toMatch(/saved|amount|420/);
  });
});
