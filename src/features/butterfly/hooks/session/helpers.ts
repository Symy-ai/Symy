/**
 * useButterflySession — 纯辅助函数（从 use-butterfly-session.ts 抽出，C1 拆分）
 *
 * 纯函数，无 React hooks，无副作用。行为零变化。
 */

import type { ButterflyChoice, StoryChapter } from '../../types';

/**
 * 从 session.choices 中构建 chapterIndex → selectedOption 映射（用于 demo 模式传递给 API）
 */
export function buildChoicesMap(choices: ButterflyChoice[] | undefined): Record<number, string> {
  const map: Record<number, string> = {};
  for (const c of choices || []) {
    if (c.selectedOption) map[c.chapterIndex] = c.selectedOption;
  }
  return map;
}

/**
 * 🔧 ARCH fix (Round 13 BUG-7+9): merge server chapters with local chapters, preserving local illustrations.
 *
 * 旧代码 6 处 action 直接 `completedChapters: session.chapters` 覆盖:
 *   - assignSubmittedChoicePreloaded/Stream/Complete
 *   - assignActiveSessionChoosing/Streaming/Complete
 * → 本地 optimistic 插图 (CLIENT_ILLU_DONE data URL / SCENE_ILLU_DONE 未持久化) 丢失。
 *
 * 根因修复: merge 模式
 *   1. server 章节为骨 (content/title/tone/timeSpan/hasChoice — story 是 source of truth)
 *   2. illustrationUrl: server 优先, 否则保留 local (本地可能有 data URL 未持久化)
 *   3. sceneIllustrations: 合并 — server 已有的保留, local 多出的补上
 *   4. local 多出的整章 (preloaded 但 server 未保存): 保留
 */
export function mergeChaptersPreservingLocalIllustration(
  serverChapters: StoryChapter[],
  localChapters: StoryChapter[],
): StoryChapter[] {
  const localByIndex = new Map(localChapters.map(c => [c.index, c]));
  const merged = serverChapters.map(srvCh => {
    const local = localByIndex.get(srvCh.index);
    if (!local) return srvCh;
    // 合并 sceneIllustrations (local 多出的场景补上)
    const mergedScenes: Record<number, string[]> = { ...(srvCh.sceneIllustrations || {}) };
    for (const [k, v] of Object.entries(local.sceneIllustrations || {})) {
      const key = Number(k);
      if (!mergedScenes[key] || mergedScenes[key].length === 0) {
        mergedScenes[key] = v;
      }
    }
    return {
      ...srvCh,
      illustrationUrl: srvCh.illustrationUrl || local.illustrationUrl,
      sceneIllustrations: Object.keys(mergedScenes).length > 0 ? mergedScenes : srvCh.sceneIllustrations,
    };
  });
  // local 多出的章节 (preloaded 未上 server) — 追加
  const serverIndices = new Set(serverChapters.map(c => c.index));
  for (const local of localChapters) {
    if (!serverIndices.has(local.index)) merged.push(local);
  }
  return merged.sort((a, b) => a.index - b.index);
}
