/**
 * DailyTasksChecklist — 今日任务清单 (PM3-P2-1)
 *
 * streak ≤ 3 时显示 "Keep your streak alive" 提示 + 今日任务清单:
 * 1. See it once (Aha Moment)
 * 2. Chat once (Mirror)
 *
 * 🔧 PM-#10 fix: 移除 "Set hourly rate" 任务 (时薪是一次性配置, 不是每日动作)
 *   旧代码: 3 个任务 (seen + chatted + hourlyRateSet), completedCount/3
 *   新代码: 2 个任务 (seen + chatted), completedCount/2
 *   时薪引导改由 onboarding 流程负责, 不混入每日任务
 *
 * 用法:
 *   <DailyTasksChecklist tasks={tasks} completedCount={completedCount} onSeeIt={handleSeeIt} onChat={handleChat} />
 */

'use client';

import { CheckCircle2, Circle, Eye, MessageCircle } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import type { DailyTasks } from '@/hooks/use-daily-tasks';

interface DailyTasksChecklistProps {
  tasks: DailyTasks;
  completedCount: number;
  onSeeIt?: () => void;
  onChat?: () => void;
  onSetRate?: () => void; // 🔧 PM-#10 fix: 保留 prop 向后兼容, 但不再渲染 (任务已移除)
}

interface TaskItem {
  key: keyof DailyTasks;
  labelKey: string;
  defaultValue: string;
  icon: React.ReactNode;
  doneIcon: React.ReactNode;
  action?: () => void;
  actionLabelKey: string;
  actionDefaultValue: string;
}

// 🔧 PM-#10 fix: 每日任务总数从 3 改为 2 (移除 hourlyRateSet)
const DAILY_TASK_TOTAL = 2;

export function DailyTasksChecklist({ tasks, completedCount, onSeeIt, onChat }: DailyTasksChecklistProps) {
  const { t } = useI18n();

  const allDone = completedCount === DAILY_TASK_TOTAL;

  const taskItems: TaskItem[] = [
    {
      key: 'seen',
      labelKey: 'buddy.dailyTask.seen',
      defaultValue: 'See it once',
      icon: <Eye className="w-4 h-4" />,
      doneIcon: <CheckCircle2 className="w-4 h-4 text-green-400" />,
      action: onSeeIt,
      actionLabelKey: 'buddy.dailyTask.go',
      actionDefaultValue: 'Go',
    },
    {
      key: 'chatted',
      labelKey: 'buddy.dailyTask.chat',
      defaultValue: 'Chat once',
      icon: <MessageCircle className="w-4 h-4" />,
      doneIcon: <CheckCircle2 className="w-4 h-4 text-green-400" />,
      action: onChat,
      actionLabelKey: 'buddy.dailyTask.go',
      actionDefaultValue: 'Go',
    },
  ];

  return (
    <div className="mt-3 mb-3 p-3 rounded-xl bg-gradient-to-br from-cyan-500/10 to-purple-500/10 border border-cyan-400/20">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-cyan-400">
          {allDone
            ? t('buddy.dailyTask.allDone', { defaultValue: '🔥 Streak secured for today!' })
            : t('buddy.dailyTask.keepAlive', { defaultValue: 'Keep your streak alive' })}
        </p>
        <span className="text-[10px] text-text-tertiary/70 font-mono">
          {/* 🔧 PM-#10 fix: /3 → /2 */}
          {completedCount}/{DAILY_TASK_TOTAL}
        </span>
      </div>

      {/* 进度条 */}
      <div className="h-1 rounded-full bg-glass-fill-strong overflow-hidden mb-2.5">
        <div
          className="h-full bg-gradient-to-r from-cyan-400 to-purple-400 transition-all duration-500"
          style={{ width: `${(completedCount / DAILY_TASK_TOTAL) * 100}%` }}
        />
      </div>

      {/* 任务列表 */}
      <div className="space-y-1.5">
        {taskItems.map((item) => {
          const done = tasks?.[item.key] ?? false;
          return (
            <div key={item.key} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {done ? item.doneIcon : <Circle className="w-4 h-4 text-text-tertiary/40" />}
                <span className={`text-xs ${done ? 'text-text-tertiary line-through' : 'text-text-secondary'}`}>
                  {t(item.labelKey, { defaultValue: item.defaultValue })}
                </span>
              </div>
              {!done && item.action && (
                <button
                  onClick={item.action}
                  // 🔧 2026-07-15 P2-14 fix: 加 aria-label + title 让用户知道 Go 按钮做什么
                  //   旧代码: 按钮只有 "Go" 文字, 用户不知道点 Go 会去哪里 (See it? Chat? Set rate?)
                  //   修复: aria-label 拼接任务名 (如 "Go: See it once"), 让屏幕阅读器和 hover tooltip 都有上下文
                  aria-label={t('buddy.dailyTask.goAriaLabel', {
                    task: t(item.labelKey, { defaultValue: item.defaultValue }),
                    defaultValue: `Go: ${item.defaultValue}`,
                  })}
                  title={t('buddy.dailyTask.goAriaLabel', {
                    task: t(item.labelKey, { defaultValue: item.defaultValue }),
                    defaultValue: `Go: ${item.defaultValue}`,
                  })}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                >
                  {t(item.actionLabelKey, { defaultValue: item.actionDefaultValue })}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
