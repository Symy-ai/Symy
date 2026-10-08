// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string }) => {
      const map: Record<string, string> = {
        'buddy.dailyTask.seen': '看一眼 (心动挑战)',
        'buddy.dailyTask.chat': '聊一次 (镜子对话)',
        'buddy.dailyTask.go': '去完成',
        'buddy.dailyTask.allDone': '🔥 今日连击已锁定!',
        'buddy.dailyTask.keepAlive': '保持连击',
      };
      return map[key] ?? opts?.defaultValue ?? key;
    },
  }),
}));
vi.mock('lucide-react', (importOriginal) => importOriginal());

import { DailyTasksChecklist } from '../daily-tasks-checklist';

const baseProps = {
  tasks: { seen: false, chatted: false } as never,
  completedCount: 0,
  onSeeIt: vi.fn(),
  onChat: vi.fn(),
};

function renderUI(props: Partial<typeof baseProps> = {}) {
  return render(<DailyTasksChecklist {...baseProps} {...props} />);
}

/**
 * daily-tasks-checklist.tsx (133行) — 今日任务清单 (PM3-P2-1, PM-#10 后两任务制)。
 *
 * 锁定:
 * - PM-#10: 两任务 (seen+chatted), 分母 /2 非 /3
 * - 全完成 → allDone 标题; 未完 → keepAlive
 * - 未完成任务显示 Go 按钮 → 回调接线
 * - 已完成任务无按钮
 */
describe('DailyTasksChecklist 今日任务清单', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('PM-#10: 两任务 + 分母 /2', () => {
    renderUI();
    expect(screen.getByText('看一眼 (心动挑战)')).toBeTruthy();
    expect(screen.getByText('聊一次 (镜子对话)')).toBeTruthy();
    expect(screen.getByText('0/2')).toBeTruthy();
    expect(screen.queryByText(/Set hourly rate|时薪/)).toBeNull(); // 已移除
  });

  it('未完成态: keepAlive 标题 + 双 Go 按钮', () => {
    renderUI();
    expect(screen.getByText('保持连击')).toBeTruthy();
    const goBtns = screen.getAllByText('去完成');
    expect(goBtns).toHaveLength(2);
  });

  it('Go 按钮 → 各自回调', () => {
    renderUI();
    const goBtns = screen.getAllByText('去完成');
    fireEvent.click(goBtns[0]);
    expect(baseProps.onSeeIt).toHaveBeenCalledTimes(1);
    fireEvent.click(goBtns[1]);
    expect(baseProps.onChat).toHaveBeenCalledTimes(1);
  });

  it('全完成 2/2 → allDone 标题 + 无 Go 按钮', () => {
    renderUI({ tasks: { seen: true, chatted: true } as never, completedCount: 2 });
    expect(screen.getByText('🔥 今日连击已锁定!')).toBeTruthy();
    expect(screen.getByText('2/2')).toBeTruthy();
    expect(screen.queryByText('去完成')).toBeNull();
  });

  it('半完成 1/2 → 单 Go 按钮 (已完成任务无按钮)', () => {
    renderUI({ tasks: { seen: true, chatted: false } as never, completedCount: 1 });
    expect(screen.getByText('1/2')).toBeTruthy();
    expect(screen.getAllByText('去完成')).toHaveLength(1);
    fireEvent.click(screen.getByText('去完成'));
    expect(baseProps.onChat).toHaveBeenCalledTimes(1);
    expect(baseProps.onSeeIt).not.toHaveBeenCalled();
  });
});
