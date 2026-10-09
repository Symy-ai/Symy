import { describe, expect, it } from 'vitest';

import { NAV_GROUPS, type NavGroup, type NavItem } from '../nav-config';

/**
 * nav-config.ts (63行) — 后台侧边栏配置 (纯数据)。
 *
 * 锁定:
 * - 四组结构 (概览/AI 与 Agent/运营/其他)
 * - 全 href 以 /admin 开头; icon 可渲染 (LucideIcon 函数)
 * - 十条目唯一 href (无重复路由)
 * - NavItem/NavGroup 形状 satisfies 锚
 */
describe('NAV_GROUPS 后台导航配置', () => {
  const allItems: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

  it('四组结构 + 组名', () => {
    expect(NAV_GROUPS.map((g) => g.title)).toEqual(['概览', 'AI 与 Agent', '运营', '其他']);
  });

  it('全 href 以 /admin 开头且唯一 (十条目)', () => {
    expect(allItems.length).toBe(10);
    const hrefs = allItems.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length); // 无重复
    for (const href of hrefs) expect(href.startsWith('/admin')).toBe(true);
  });

  it('icon 全部可渲染 (LucideIcon forwardRef 组件: 对象+\$typeof)', () => {
    for (const item of allItems) {
      // lucide-react 图标是 forwardRef 对象 ({ \$typeof, render }), 非函数
      expect(item.icon).toBeTruthy();
      expect(typeof (item.icon as unknown as { render?: unknown }).render).toBe('function');
      expect(item.label).toBeTruthy();
    }
  });

  it('形状 satisfies 锚 (缺字段编译红)', () => {
    const probe: NavGroup = {
      title: '测试组',
      items: [{ href: '/admin/x', label: 'X', icon: NAV_GROUPS[0].items[0].icon, todo: true }],
    };
    expect(probe.items[0].todo).toBe(true);
  });
});
