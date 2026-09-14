/**
 * Tab Registry — Central source of truth for tab type, order, and routing.
 *
 * 🔧 ARCH fix: 之前 Tab type / tab 顺序 / URL 别名散落在:
 *   - components/tab-bar.tsx (Tab type 定义)
 *   - app/page.tsx (tab 白名单, switchTab order)
 *   - components/onboarding-guide.tsx (switchToTab string)
 *
 * 现在集中到此处, 消除重复定义。消费方通过导入此文件获取 Tab 类型信息。
 *
 * 层级约束: 此文件属于 lib/ 层, 不可从 @/components/ 或 @/hooks/ 导入。
 */

// ============================================================
// TabId — 所有可能的 tab 标识符 (含历史/隐藏 tab)
// ============================================================

/**
 * TabId union type.
 *
 * 包含所有 tab 标识符:
 * - 可见 tab (TabBar 中显示): buddy, defense, profile
 * - 隐藏/全屏覆盖 tab: chat, butterfly, monitor, family
 * - 历史保留 tab (已合并但 type 需兼容): insights
 *
 * 🔧 ARCH fix Round 78: 'insights' tab 已合并到 profile, 但 type 保留兼容
 * 🔧 ARCH fix Round 105: 3-tab 架构 — chat/butterfly/gacha 移到 Buddy 页面入口
 */
export type TabId = 'chat' | 'buddy' | 'insights' | 'profile' | 'butterfly' | 'monitor' | 'family' | 'defense';

/**
 * 兼容别名: 外部代码可能使用旧名 `Tab`。
 * 保持 `Tab` 作为 `TabId` 的 alias, 避免破坏现有导入。
 */
export type Tab = TabId;

// ============================================================
// TAB_ORDER — 可见 tab 顺序 (TabBar 显示的 tab)
// ============================================================

/**
 * TabBar 中显示的 tab, 按视觉顺序排列。
 *
 * Round 105: 3-tab 架构 (Buddy / Defense Net / Me)
 *   - Mirror 入口在 Buddy 页面的 "看见" 按钮
 *   - Gacha 入口在 Buddy 页面
 */
export const TAB_ORDER: readonly TabId[] = ['chat', 'buddy', 'defense', 'profile'] as const;

/**
 * URL ?tab= 参数接受的白名单。
 *
 * 这些 tab 可通过 URL 参数直接设置 (如 ?tab=butterfly 分享蝴蝶故事)。
 */
export const TAB_URL_WHITELIST: readonly TabId[] = ['chat', 'buddy', 'profile', 'butterfly', 'monitor', 'family', 'defense'] as const;

// ============================================================
// TAB_ALIASES — URL 路径别名映射 (供 proxy/middleware 路由用)
// ============================================================

/**
 * URL 路径片段 → TabId 映射。
 *
 * 当前 app 使用单一 SPA 路由 (?tab= 参数), 无路径别名路由。
 * 此映射为未来扩展预留 — 如果添加 /buddy, /profile 等独立路径,
 * proxy.ts 或 next.config 重写规则可引用此映射。
 *
 * proxy.ts 当前是纯 Supabase auth 中间件, 不做 tab 路由。
 */
export const TAB_ALIASES: Readonly<Record<string, TabId>> = {
  // 路径别名预留 (当前未使用 — app 是 SPA, 用 ?tab= 参数)
  // buddy: 'buddy',
  // profile: 'profile',
  // butterfly: 'butterfly',
} as const;

// ============================================================
// 类型守卫
// ============================================================

// 用于类型守卫的完整 tab id 集合 (含所有历史/隐藏 tab)
const ALL_TAB_IDS: readonly TabId[] = [
  'chat',
  'buddy',
  'insights',
  'profile',
  'butterfly',
  'monitor',
  'family',
  'defense',
] as const;

/**
 * 运行时类型守卫: 判断字符串是否为合法的 TabId。
 *
 * 用于验证 URL 参数 (?tab=xxx) 等不可信输入。
 */
export function isTabId(value: string): value is TabId {
  return (ALL_TAB_IDS as readonly string[]).includes(value);
}
