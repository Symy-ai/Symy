/**
 * Event Structure Contract Tests — butterfly 事件结构一致性
 *
 * 🔧 架构优化 (基于《真正难的不是做一个 AI Demo》文章原则):
 *    "测试不只是测功能, 也是给 AI 画边界"
 *
 * 这些测试验证 butterfly 事件 payload 位置的一致性:
 *   - SSE 事件 (CHAPTER_START, CHAPTER_TEXT, etc.): payload 在 .data 字段
 *   - Actor 事件 (CLIENT_ILLU_DONE, SCENE_ILLU_DONE, etc.): payload 在顶层
 *
 * P0-A 崩溃根因: actions 读取 event.data, 但 Actor 事件的 payload 在顶层 → undefined → crash
 * 这些测试确保:
 *   1. 有 .data 的事件 → actions 可以读 event.data
 *   2. 顶层 payload 的事件 → actions 不能读 event.data
 *   3. 新增事件必须声明 payload 位置
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC_DIR = join(process.cwd(), 'src');

function readSrcFile(relPath: string): string {
  return readFileSync(join(SRC_DIR, relPath), 'utf-8');
}

describe('Event Structure Contract: butterfly events', () => {
  // 🔧 ARCH fix (2026-07-22): Event types moved to butterfly-machine-types.ts
  const machinePath = 'features/butterfly/hooks/session/butterfly-machine-types.ts';
  const machineSource = readSrcFile(machinePath);

  describe('SSE events (payload in .data)', () => {
    const sseEvents = [
      'CHAPTER_START',
      'CHAPTER_TEXT',
      'CHAPTER_END',
      'CHOICE_PROMPT',
      'OUTLINE_UPDATED',
      'ILLUSTRATION_GENERATED',
      'ILLUSTRATION_FAILED',
      'SCENE_ILLUSTRATION_GENERATED',
      'STORY_COMPLETE',
      'STREAM_ERROR',
    ];

    for (const eventType of sseEvents) {
      it(`${eventType} has .data field (SSE event convention)`, () => {
        // 检查事件定义包含 data 字段
        const regex = new RegExp(`type: '${eventType}';\\s*data:`);
        expect(machineSource).toMatch(regex);
      });
    }
  });

  describe('Actor events (payload at top-level, NO .data)', () => {
    const actorEvents = [
      'CLIENT_ILLU_DONE',
      'SCENE_ILLU_DONE',
      'ILLUSTRATION_POLLING_UPDATE',
      'ILLUSTRATION_POLLING_DONE',
      'REGENERATE_DONE',
    ];

    for (const eventType of actorEvents) {
      it(`${eventType} has top-level payload (NO .data field)`, () => {
        // 检查事件定义不包含 data: 字段
        const dataRegex = new RegExp(`type: '${eventType}';[^}]*data:`);
        expect(machineSource).not.toMatch(dataRegex);
      });
    }
  });

  describe('Preload events (payload in .data — legacy, should not change)', () => {
    const preloadEvents = [
      'PRELOAD_CHAPTER_DONE',
      'PRELOAD_BRANCH_DONE',
      'PRELOAD_STORY_COMPLETE_DONE',
    ];

    for (const eventType of preloadEvents) {
      it(`${eventType} has .data field (preload event convention)`, () => {
        // 检查事件定义包含 data: 字段 (可能有其他字段在前面)
        const regex = new RegExp(`type: '${eventType}';[^}]*data:`);
        expect(machineSource).toMatch(regex);
      });
    }
  });

  describe('Actions read correct payload location', () => {
    const actionsPath = 'features/butterfly/hooks/session/machine-actions-illustration.ts';
    const actionsSource = readSrcFile(actionsPath);

    it('Actor event actions do NOT read event.data (P0-A fix)', () => {
      // 移除注释
      const codeOnly = actionsSource
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');

      // CLIENT_ILLU_DONE action 不能读 event.data
      const clientIlluMatch = codeOnly.match(/assignClientIllustration:[\s\S]*?(?=\n  \w+:|$)/);
      if (clientIlluMatch) {
        expect(clientIlluMatch[0]).not.toContain('event.data');
      }

      // SCENE_ILLU_DONE action 不能读 event.data
      const sceneIlluMatch = codeOnly.match(/assignSceneIllustrationDone:[\s\S]*?(?=\n  \w+:|$)/);
      if (sceneIlluMatch) {
        expect(sceneIlluMatch[0]).not.toContain('event.data');
      }

      // ILLUSTRATION_POLLING_UPDATE action 不能读 event.data
      const pollingMatch = codeOnly.match(/assignPollingUpdate:[\s\S]*?(?=\n  \w+:|$)/);
      if (pollingMatch) {
        expect(pollingMatch[0]).not.toContain('event.data');
      }
    });
  });
});
