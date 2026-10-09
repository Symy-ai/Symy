import { describe, expect, it } from 'vitest';

import * as engineBarrel from '../index';
import * as prompts from '../prompts';
import * as parsers from '../parsers';
import * as streamHelpers from '../stream-helpers';
import { DEFAULT_CHAPTER_COUNT } from '../constants';

/**
 * engine/index.ts (36行) — C6 barrel (常量+prompts+parsers+stream 四组)。
 *
 * 锁定:
 * - 常量双件
 * - prompts 九函数
 * - parsers 五函数
 * - stream 四函数
 */
describe('engine barrel 导出面', () => {
  it('常量+prompts 锚', () => {
    expect(engineBarrel.DEFAULT_CHAPTER_COUNT).toBe(DEFAULT_CHAPTER_COUNT);
    expect(engineBarrel.buildOutlineSystemPrompt).toBe(prompts.buildOutlineSystemPrompt);
    expect(engineBarrel.buildCompleteStoryUserPrompt).toBe(prompts.buildCompleteStoryUserPrompt);
    expect(engineBarrel.buildButterflyAgentMessage).toBe(prompts.buildButterflyAgentMessage);
  });

  it('parsers+stream 锚', () => {
    expect(engineBarrel.parseOutlineFromLLM).toBe(parsers.parseOutlineFromLLM);
    expect(engineBarrel.parseCompleteStoryFromLLM).toBe(parsers.parseCompleteStoryFromLLM);
    expect(engineBarrel.validateTone).toBe(parsers.validateTone);
    expect(engineBarrel.transformLettaStreamToStoryStream).toBe(streamHelpers.transformLettaStreamToStoryStream);
    expect(engineBarrel.isToolCallEvent).toBe(streamHelpers.isToolCallEvent);
    expect(engineBarrel.truncateAtSentence).toBe(streamHelpers.truncateAtSentence);
  });
});
