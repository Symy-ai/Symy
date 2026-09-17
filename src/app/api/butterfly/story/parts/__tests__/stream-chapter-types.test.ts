/**
 * stream-chapter-types 常量契约测试 (batch78-c — testgap v9 §十五.3 观察名单, 纯测试)
 *
 * 背景 (漂移史): 文件头注释 (2026-07-20 P0 fix) 曾写 "50s", 而导出值是 30_000 —
 * 注释写于 50s 时代, 值后调为 30s 时未回改注释 (兄弟文件 stream-all-story.ts:56
 * 还保有一个同名本地 50_000 副本, 与本文件的 30_000 并存)。
 *
 * 契约:
 *  - 运行时数值: STREAM_TIMEOUT_MS === 30_000 (stream-chapter.ts 两处 setTimeout
 *    与 re-export 均消费此值)
 *  - 源码-运行时同步: 本文件内 `export const STREAM_TIMEOUT_MS = <字面量>` 的字面量
 *    必须等于导入的运行时值 — 防未来改字面量/引入间接层时声明与运行时分叉
 *  - 源码头注释: 修复说明必须同步声明 30s (拒绝 50s/110s 旧值)
 *  - MAX_STORY_RETRIES === 2 (同文件次级常量, AI 空内容重试上限)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { STREAM_TIMEOUT_MS, MAX_STORY_RETRIES } from '../stream-chapter-types';

const SOURCE = readFileSync(
  join(process.cwd(), 'src/app/api/butterfly/story/parts/stream-chapter-types.ts'),
  'utf-8',
);

describe('STREAM_TIMEOUT_MS 常量契约', () => {
  it('运行时值 = 30_000 (30s, 非 110s/50s 旧值)', () => {
    expect(STREAM_TIMEOUT_MS).toBe(30_000);
    expect(STREAM_TIMEOUT_MS).toBe(30 * 1000);
  });

  it('源码声明字面量与头注释均同步 30s (漂移哨兵)', () => {
    const match = SOURCE.match(/export const STREAM_TIMEOUT_MS = ([\d_]+);/);
    expect(match, '源码中必须存在 export const STREAM_TIMEOUT_MS = <数字字面量>;').not.toBeNull();
    const literal = Number(match![1].replaceAll('_', ''));
    expect(literal).toBe(STREAM_TIMEOUT_MS);
    expect(SOURCE).toMatch(/^\/\/\s*修复:\s*30s(?![0-9])/mu);
  });

  it('MAX_STORY_RETRIES = 2 (空内容重试上限)', () => {
    expect(MAX_STORY_RETRIES).toBe(2);
  });
});
