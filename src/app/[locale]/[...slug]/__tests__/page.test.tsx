import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  redirect: vi.fn((url: string): never => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn((): never => {
    throw new Error('NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: M.redirect,
  notFound: M.notFound,
}));
vi.mock('@/i18n/routing', () => ({
  routing: { locales: ['zh', 'en'], defaultLocale: 'zh' },
}));

import CatchAllTabRedirect from '../page';

function makeParams(locale: string, slug: string[]) {
  return { params: Promise.resolve({ locale, slug }) } as never;
}

/**
 * [locale]/[...slug]/page.tsx (36行) — SPA tab 旧路径重定向。
 *
 * 锁定:
 * - 已知 tab 名 (大小写归一) → redirect /{locale}?tab=
 * - 别名映射 (defense-net/me/insights/dashboard → 标准 tab)
 * - 未知 slug → notFound
 * - 无效 locale → defaultLocale 兜底
 */
describe('CatchAllTabRedirect', () => {
  beforeEach(() => vi.clearAllMocks());

  it('已知 tab (大小写归一) → redirect', async () => {
    await expect(CatchAllTabRedirect(makeParams('zh', ['Buddy']))).rejects.toThrow('REDIRECT:/zh?tab=buddy');
  });

  it('别名映射: defense-net/me/insights/dashboard 全归标准 tab', async () => {
    await expect(CatchAllTabRedirect(makeParams('zh', ['defense-net']))).rejects.toThrow('REDIRECT:/zh?tab=defense');
    await expect(CatchAllTabRedirect(makeParams('en', ['me']))).rejects.toThrow('REDIRECT:/en?tab=profile');
    await expect(CatchAllTabRedirect(makeParams('zh', ['insights']))).rejects.toThrow('REDIRECT:/zh?tab=profile');
    await expect(CatchAllTabRedirect(makeParams('en', ['dashboard']))).rejects.toThrow('REDIRECT:/en?tab=buddy');
  });

  it('未知 slug → notFound', async () => {
    await expect(CatchAllTabRedirect(makeParams('zh', ['random-thing']))).rejects.toThrow('NOT_FOUND');
    expect(M.notFound).toHaveBeenCalledTimes(1);
  });

  it('无效 locale → defaultLocale 兜底', async () => {
    await expect(CatchAllTabRedirect(makeParams('fr', ['chat']))).rejects.toThrow('REDIRECT:/zh?tab=chat');
  });
});
