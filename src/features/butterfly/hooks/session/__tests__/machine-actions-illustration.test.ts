import { describe, expect, it } from 'vitest';

import { IllustrationActions } from '../machine-actions-illustration';

/**
 * machine-actions-illustration.ts (145行) — XState 插图追踪 actions (Round 4 拆分)。
 *
 * typedAssign 返回 assign() 包装 — 测试法 (R114/R119 模式): assign 的 executor
 * 在 XState v5 内部存于返回对象的私有结构; 直接从 action 定义难取。
 * 改用 assign(obj) 的公共语义: XState v5 assign() 返回 {type: 'xstate.assign',
 * assignment: fn} — 从 assignment 字段直取纯函数调用。
 */
function executorOf(action: unknown): (params: { context: unknown; event: unknown }) => unknown {
  const a = action as { assignment?: unknown };
  if (typeof a.assignment === 'function') return a.assignment as never;
  // typedAssignObject: assignment 是对象字面量
  return () => a.assignment;
}

const ctx = (over: Record<string, unknown> = {}) => ({
  chapterSceneTriggered: [],
  clientIllustrationAttempted: [],
  regeneratingChapters: [],
  completedChapters: [],
  isPollingActive: true,
  ...over,
}) as never;

/**
 * 锁定:
 * - markChapterTriggered: CHAPTER_END 去重追加
 * - pushClientIllustrationAttempted: 顶层字段 (P0-A: 非 event.data)
 * - pushRegenerating: 去重 + data 防御
 * - assignClientIllustration: chapter 匹配更新 url + 清 regenerating
 * - assignSceneIllustrationDone: sceneIllustrations[sceneIndex] 追加 (R74 修复锚)
 * - assignPollingUpdate: chapters 整体替换 + 三追踪数组清零
 * - clearPollingActive: isPollingActive=false
 * - 全部: 事件不匹配 → {} (无副作用)
 */
describe('IllustrationActions (assign executor 直调)', () => {
  it('markChapterTriggered: CHAPTER_END 去重追加', () => {
    const run = executorOf(IllustrationActions.markChapterTriggered);
    const r1 = run({ context: ctx(), event: { type: 'CHAPTER_END', data: { chapterIndex: 2 } } }) as { chapterSceneTriggered: number[] };
    expect(r1.chapterSceneTriggered).toEqual([2]);
    const r2 = run({ context: ctx({ chapterSceneTriggered: [2] }), event: { type: 'CHAPTER_END', data: { chapterIndex: 2 } } }) as { chapterSceneTriggered: number[] };
    expect(r2.chapterSceneTriggered).toEqual([2]); // 去重
    const r3 = run({ context: ctx(), event: { type: 'OTHER' } });
    expect(r3).toEqual({});
  });

  it('pushClientIllustrationAttempted: 顶层 chapterIndex (P0-A 锚)', () => {
    const run = executorOf(IllustrationActions.pushClientIllustrationAttempted);
    const r = run({ context: ctx(), event: { type: 'CLIENT_ILLU_DONE', chapterIndex: 3, url: 'u' } }) as { clientIllustrationAttempted: number[] };
    expect(r.clientIllustrationAttempted).toEqual([3]);
    // chapterIndex 缺失 → {}
    expect(run({ context: ctx(), event: { type: 'CLIENT_ILLU_DONE', url: 'u' } })).toEqual({});
  });

  it('pushRegenerating: 去重 + data 防御', () => {
    const run = executorOf(IllustrationActions.pushRegenerating);
    const r1 = run({ context: ctx(), event: { type: 'REGENERATE_ILLUSTRATION', data: { chapterIndex: 1 } } }) as { regeneratingChapters: number[] };
    expect(r1.regeneratingChapters).toEqual([1]);
    const r2 = run({ context: ctx({ regeneratingChapters: [1] }), event: { type: 'REGENERATE_ILLUSTRATION', data: { chapterIndex: 1 } } });
    expect(r2).toEqual({});
    expect(run({ context: ctx(), event: { type: 'REGENERATE_ILLUSTRATION' } })).toEqual({});
  });

  it('assignClientIllustration: 匹配章更新 url + null 保留旧图 + 清 regenerating', () => {
    const run = executorOf(IllustrationActions.assignClientIllustration);
    const chapters = [{ index: 1, illustrationUrl: 'old.png' }, { index: 2, illustrationUrl: 'keep.png' }];
    const r = run({ context: ctx({ completedChapters: chapters, regeneratingChapters: [1] }), event: { type: 'CLIENT_ILLU_DONE', chapterIndex: 1, url: 'new.png' } }) as { completedChapters: { index: number; illustrationUrl?: string }[]; regeneratingChapters: number[] };
    expect(r.completedChapters[0].illustrationUrl).toBe('new.png');
    expect(r.completedChapters[1].illustrationUrl).toBe('keep.png');
    expect(r.regeneratingChapters).toEqual([]);
    // url null → 保留旧图
    const r2 = run({ context: ctx({ completedChapters: chapters }), event: { type: 'CLIENT_ILLU_DONE', chapterIndex: 1, url: null } }) as { completedChapters: { illustrationUrl?: string }[] };
    expect(r2.completedChapters[0].illustrationUrl).toBe('old.png');
  });

  it('assignSceneIllustrationDone: sceneIllustrations[sceneIndex] 追加 (R74 锚: SCENE_ILLU_DONE 非 SCENE_ILLUSTRATION_DONE)', () => {
    const run = executorOf(IllustrationActions.assignSceneIllustrationDone);
    const chapters = [{ index: 2, sceneIllustrations: { 0: ['a.png'] } }];
    const r = run({ context: ctx({ completedChapters: chapters }), event: { type: 'SCENE_ILLU_DONE', chapterIndex: 2, sceneIndex: 1, url: 'b.png' } }) as { completedChapters: { sceneIllustrations: Record<number, string[]> }[] };
    expect(r.completedChapters[0].sceneIllustrations[1]).toEqual(['b.png']);
    expect(r.completedChapters[0].sceneIllustrations[0]).toEqual(['a.png']); // 原有保留
    // null url → 不更新
    const r2 = run({ context: ctx({ completedChapters: chapters }), event: { type: 'SCENE_ILLU_DONE', chapterIndex: 2, sceneIndex: 0, url: null } }) as { completedChapters: typeof chapters };
    expect(r2.completedChapters[0].sceneIllustrations[0]).toEqual(['a.png']);
    // 旧错误事件名 → {} (R74 前的 bug 锚: 永不误匹配)
    expect(run({ context: ctx(), event: { type: 'SCENE_ILLUSTRATION_DONE' as never } })).toEqual({});
  });

  it('assignPollingUpdate: chapters 整体替换 + 三追踪数组清零', () => {
    const run = executorOf(IllustrationActions.assignPollingUpdate);
    const fresh = [{ index: 1, illustrationUrl: 'x.png' }];
    const r = run({ context: ctx({ chapterSceneTriggered: [1, 2], clientIllustrationAttempted: [1], regeneratingChapters: [2] }), event: { type: 'ILLUSTRATION_POLLING_UPDATE', chapters: fresh } }) as { completedChapters: typeof fresh; chapterSceneTriggered: number[]; clientIllustrationAttempted: number[] };
    expect(r.completedChapters).toEqual(fresh);
    expect(r.chapterSceneTriggered).toEqual([]);
    expect(r.clientIllustrationAttempted).toEqual([]);
    // chapters 非数组 → {}
    expect(run({ context: ctx(), event: { type: 'ILLUSTRATION_POLLING_UPDATE' } })).toEqual({});
  });

  it('clearPollingActive: 对象 assign 直出 isPollingActive=false', () => {
    const run = executorOf(IllustrationActions.clearPollingActive);
    const r = run({ context: ctx(), event: {} }) as { isPollingActive: boolean };
    expect(r.isPollingActive).toBe(false);
  });
});
