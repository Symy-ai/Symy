/**
 * green-alt-copy — 拦截后温暖话术扩展 (独立于 rescue 数据管道)
 *
 * 产品叙事: 拦截不是「退款/已拦」，而是「又守住了一次」。
 * 这里只负责内容库和文案映射，不改 context-builder green-alt 数据管道。
 */

export type InterceptCategory =
  | 'electronics'
  | 'clothing'
  | 'beauty'
  | 'home'
  | 'food'
  | 'default';

export interface CategoryWarmCopy {
  /** 品类短句 i18n key (温暖化) */
  lineKey: string;
  /** 复用句 i18n key (可选) */
  reuseKey?: string;
}

export const CATEGORY_WARM_COPY: Record<InterceptCategory, CategoryWarmCopy> = {
  electronics: {
    lineKey: 'chat.interceptWarm.electronics',
    reuseKey: 'chat.interceptWarm.electronicsReuse',
  },
  clothing: {
    lineKey: 'chat.interceptWarm.clothing',
    reuseKey: 'chat.interceptWarm.clothingReuse',
  },
  beauty: {
    lineKey: 'chat.interceptWarm.beauty',
    reuseKey: 'chat.interceptWarm.beautyReuse',
  },
  home: {
    lineKey: 'chat.interceptWarm.home',
    reuseKey: 'chat.interceptWarm.homeReuse',
  },
  food: {
    lineKey: 'chat.interceptWarm.food',
    reuseKey: 'chat.interceptWarm.foodReuse',
  },
  default: {
    lineKey: 'chat.interceptWarm.default',
    reuseKey: 'chat.interceptWarm.defaultReuse',
  },
};

/** 将外部品类归一化到内部 id；未命中则 default */
export function normalizeInterceptCategory(raw?: string): InterceptCategory {
  const v = raw?.trim().toLowerCase();
  if (!v) return 'default';
  if (/电子|电器|phone|laptop|computer|audio|耳机|tablet|console|3c/.test(v)) return 'electronics';
  if (/服|衣|鞋|裤|裙|外套|夹克|clothing|fashion|jacket|shoe/.test(v)) return 'clothing';
  if (/美妆|护肤|彩妆|口红|香水|beauty|skincare|makeup|cosmetic|lipstick/.test(v)) return 'beauty';
  if (/家居|家具|收纳|清洁|纸巾|home|furniture|cleaner|tissue/.test(v)) return 'home';
  if (/食品|零食|饮料|生鲜|food|snack|drink|grocery/.test(v)) return 'food';
  return 'default';
}
