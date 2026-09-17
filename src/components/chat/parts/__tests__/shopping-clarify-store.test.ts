/**
 * shopping-clarify-store tests (batch78-b — testgap v9 §十五.2 chat hooks 补盲, 纯测试)
 *
 * 覆盖 (断言与现状对齐):
 *  - SSR (无 window): 读/写都降级为 no-op, 不抛 ReferenceError
 *  - window 存在但 sessionStorage 不可用: 同样降级不抛
 *  - 坏 JSON / 非数组 JSON / 非字符串元素: 读降级为 [], 过滤脏元素
 *  - markShoppingSubjectAsked: 追加 + 大小写不敏感去重 + 已存在不重写;
 *    setItem 抛错 (配额满/隐私模式) 时吞掉不抛
 *
 * 环境说明: 本文件跑在默认 node 环境 — 模块在调用时才读 window.sessionStorage,
 * 用 vi.stubGlobal('window', ...) 模拟浏览器, 不 stub 即天然 SSR。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readAskedShoppingSubjects, markShoppingSubjectAsked } from '../shopping-clarify-store';

const STORAGE_KEY = 'symy_shopping_clarify_asked';

function fakeStorage(initial: string | null = null) {
  const store = new Map<string, string>();
  if (initial !== null) store.set(STORAGE_KEY, initial);
  return {
    getItem: vi.fn((k: string) => (store.has(k) ? store.get(k)! : null)),
    setItem: vi.fn((k: string, v: string) => {
      store.set(k, v);
    }),
  };
}

function stubWindow(storage: unknown) {
  vi.stubGlobal('window', { sessionStorage: storage });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readAskedShoppingSubjects — 降级路径', () => {
  it('SSR (无 window): 返回 [], 不抛 ReferenceError', () => {
    vi.unstubAllGlobals();
    expect(() => readAskedShoppingSubjects()).not.toThrow();
    expect(readAskedShoppingSubjects()).toEqual([]);
  });

  it('window 存在但 sessionStorage 缺失 (hydration 中间态): 返回 [], 不抛', () => {
    stubWindow({});
    expect(readAskedShoppingSubjects()).toEqual([]);
  });

  it('坏 JSON: 返回 [], 不抛', () => {
    stubWindow(fakeStorage('{not valid json'));
    expect(readAskedShoppingSubjects()).toEqual([]);
  });

  it('非数组 JSON (字符串/对象): 返回 []', () => {
    stubWindow(fakeStorage('"just a string"'));
    expect(readAskedShoppingSubjects()).toEqual([]);
    stubWindow(fakeStorage('{"a":1}'));
    expect(readAskedShoppingSubjects()).toEqual([]);
  });

  it('数组内非字符串元素被过滤, 只留字符串', () => {
    stubWindow(fakeStorage('["奶茶", 42, null, "手办", {}]'));
    expect(readAskedShoppingSubjects()).toEqual(['奶茶', '手办']);
  });

  it('正常读回: null 视作空, 合法数组原样返回', () => {
    stubWindow(fakeStorage(null));
    expect(readAskedShoppingSubjects()).toEqual([]);
    stubWindow(fakeStorage('["a","b"]'));
    expect(readAskedShoppingSubjects()).toEqual(['a', 'b']);
  });
});

describe('markShoppingSubjectAsked — 写入与去重', () => {
  it('首次标记: 追加写入 sessionStorage', () => {
    const storage = fakeStorage(null);
    stubWindow(storage);

    markShoppingSubjectAsked('奶茶');
    expect(storage.setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(['奶茶']));
  });

  it('大小写不敏感去重: 已存在 (不同大小写) 不再追加', () => {
    const storage = fakeStorage('["Milk Tea"]');
    stubWindow(storage);

    markShoppingSubjectAsked('milk tea');
    expect(storage.setItem).not.toHaveBeenCalled();

    markShoppingSubjectAsked('手办');
    expect(storage.setItem).toHaveBeenCalledWith(STORAGE_KEY, '["Milk Tea","手办"]');
  });

  it('SSR (无 window): 写入 no-op 不抛', () => {
    vi.unstubAllGlobals();
    expect(() => markShoppingSubjectAsked('奶茶')).not.toThrow();
  });

  it('sessionStorage 缺失: 写入 no-op 不抛', () => {
    stubWindow({});
    expect(() => markShoppingSubjectAsked('奶茶')).not.toThrow();
  });

  it('setItem 抛错 (配额满/隐私模式): 吞掉不抛', () => {
    stubWindow({
      getItem: () => '["a"]',
      setItem: vi.fn(() => {
        throw new DOMException('quota exceeded', 'QuotaExceededError');
      }),
    });
    expect(() => markShoppingSubjectAsked('b')).not.toThrow();
  });
});
