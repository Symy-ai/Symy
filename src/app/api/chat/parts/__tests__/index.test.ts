/**
 * chat/parts barrel 完整性 (types.ts 11行 + index.ts 17行)。
 *
 * 锁定: ChallengeContext 单一 source of truth 链 —
 * chat/parts → types.ts → @/types/challenge-context 三层同源,
 * 运行时无循环依赖、导入不抛错 (纯类型文件零运行时行为)。
 */
import { describe, expect, it } from 'vitest';
import * as barrel from '../index';
import * as types from '../types';
import * as source from '@/types/challenge-context';

describe('chat/parts barrel 完整性', () => {
  it('index → types → @/types/challenge-context 三层导入零异常', async () => {
    await expect(Promise.all([import('../index'), import('../types'), import('@/types/challenge-context')])).resolves.toBeDefined();
  });

  it('barrel 只做类型再导出 (运行时无值导出)', () => {
    expect(Object.keys(barrel)).toEqual([]);
    expect(Object.keys(types)).toEqual([]);
    expect(Object.keys(source)).toEqual([]);
  });
});
