/**
 * green-alternatives — 绿色替代话术库 (表驱动, zh+en 双语)
 *
 * 绿色转向 (green-pivot) 的一部分: 当用户想买高环境影响产品时,
 * 脑 (Letta agent) 用这里的话术给替代建议 + 复用建议 ("你手头可能已有X"),
 * 而不是拦住用户。语气遵循镜子哲学: 不评判, 只守护。
 *
 * 本文件只保留匹配逻辑; 词条数据按主题拆在:
 *   - green-alt-entries-wear.ts  (象牙/玳瑁/皮草/动物皮革)
 *   - green-alt-entries-home.ts  (一次性塑料/快时尚/纸巾/电池)
 *   - green-alt-entries-beauty.ts (美妆个护: refill/固体皂/囤货复用)
 *   - green-alt-entries-electronics.ts (3C 数码: 官翻/维修优先/以旧换新)
 *   - green-alt-entries-food.ts (食品饮品: 奶茶/外卖/瓶装水/咖啡/零食)
 *   - green-alt-entries-apparel.ts (服饰鞋包: 买衣冲动/限量球鞋/包轮换/换季囤衣/胶囊衣橱)
 *   - green-alt-entries-household.ts (居家生活: 收纳/香薰/促销囤货/小家电/旧物改造)
 *   - green-alt-entries-subscription.ts (订阅与虚拟消费: 会员体检/打赏冷静/充值换算/囤卡激活/家庭组拼车)
 *   - green-alt-entries-travel.ts (出行与旅行: 装备租借/旅行分装/囤券冷静/纪念品三问/市内绿色出行)
 *   - green-alt-entries-parenting.ts (母婴亲子: 童装传递/玩具先借/绘本图书馆/大件租赁/纸尿裤促销数学)
 *   - green-alt-entries-sports.ts (运动户外: 年卡次卡数学/服饰胶囊/二手球拍/家用器材冷静/补剂囤货)
 *   - green-alt-entries-gifting.ts (节日送礼: 体验型礼物/愿望单前置/二手绝版书馈赠/手作礼物/包装减法/节日补买冷静)
 *   - green-alt-entries-furniture.ts (家具大件耐用品: 二手家具先行/搬家租用/维修翻新/低频工具借不买/大件72小时冷静期/耐用品买耐用)
 *   - green-alt-entries-pets.ts (宠物用品: 粮食囤货数学/二手大件优先/耐咬玩具/猫砂订阅审计/药品先问兽医/领养优先)
 *   - green-alt-entries-garden.ts (园艺绿植: 工具借共享/花盆二手/种子代成苗/邻里换苗/堆肥代化肥/节水浇灌)
 *   - green-alt-entries-office.ts (办公学习: 教材二手/电子版图书馆优先/笔芯替换/余页本先用/打印不买机/开学季冷静期)
 *   - green-alt-entries-digital-content.ts (数字内容: 电子书重复购买/有声书囤积/课程囤积/云存储清理/音乐重复购买/字体素材按项目)
 *   - green-alt-entries-health-care.ts (健康与个护: 药箱临期清点/隐形眼镜节奏补货/美容仪闲置/香水轮换/维生素成分对照)
 *   - green-alt-entries-repair-care.ts (维修与再利用: 修鞋换底/皮具护理/缝补改衣/换电换屏评估/家电检修/骑行保养)
 *   - green-alt-entries-celebration.ts (庆典与礼赠: 婚礼布置租用/回礼消耗小物/生日会体验/节庆装饰复用/乔迁宴借租/同事交换礼规则/长辈陪伴与修复/伴手手作本地)
 *   - green-alt-entries-pet-first-care.ts (第一次养宠物: 小包装口粮/一种零食/用品借先试/清洁补充装/单件玩具/过敏小包装)
 *   - green-alt-types.ts        (类型)
 *
 * 用法:
 *   const suggestion = suggestAlternative("想买个貂皮围巾");
 *   if (suggestion) reply(suggestion.message);
 *
 * 设计:
 * - 纯函数, 无 IO, 无状态 — 可在脑侧工具、API route、前端任意复用
 * - trigger 匹配同时看 zh + en 词表 (用户可能中英混说: "买 ivory 手镯")
 * - locale 只控制输出文案语言, 不控制匹配范围
 * - 不在这里读 symy_green_pref — 开关判断由调用方 (脑侧规则/路由) 负责
 */

import { normalizeGreenQuery } from './green-query-normalize';
import { GREEN_ALT_ENTRIES_WEAR } from './green-alt-entries-wear';
import { GREEN_ALT_ENTRIES_HOME } from './green-alt-entries-home';
import { GREEN_ALT_ENTRIES_BEAUTY } from './green-alt-entries-beauty';
import { GREEN_ALT_ENTRIES_ELECTRONICS } from './green-alt-entries-electronics';
import { GREEN_ALT_ENTRIES_FOOD } from './green-alt-entries-food';
import { GREEN_ALT_ENTRIES_APPAREL } from './green-alt-entries-apparel';
import { GREEN_ALT_ENTRIES_HOUSEHOLD } from './green-alt-entries-household';
import { GREEN_ALT_ENTRIES_SUBSCRIPTION } from './green-alt-entries-subscription';
import { GREEN_ALT_ENTRIES_TRAVEL } from './green-alt-entries-travel';
import { GREEN_ALT_ENTRIES_PARENTING } from './green-alt-entries-parenting';
import { GREEN_ALT_ENTRIES_SPORTS } from './green-alt-entries-sports';
import { GREEN_ALT_ENTRIES_GIFTING } from './green-alt-entries-gifting';
import { GREEN_ALT_ENTRIES_FURNITURE } from './green-alt-entries-furniture';
import { GREEN_ALT_ENTRIES_PETS } from './green-alt-entries-pets';
import { GREEN_ALT_ENTRIES_GARDEN } from './green-alt-entries-garden';
import { GREEN_ALT_ENTRIES_OFFICE } from './green-alt-entries-office';
import { GREEN_ALT_ENTRIES_DIGITAL_CONTENT } from './green-alt-entries-digital-content';
import { GREEN_ALT_ENTRIES_HEALTH_CARE } from './green-alt-entries-health-care';
import { GREEN_ALT_ENTRIES_REPAIR_CARE } from './green-alt-entries-repair-care';
import { GREEN_ALT_ENTRIES_CELEBRATION } from './green-alt-entries-celebration';
import { GREEN_ALT_ENTRIES_PET_FIRST_CARE } from './green-alt-entries-pet-first-care';
import type { GreenAlternativeEntry, GreenAlternativeSuggestion, GreenLocale } from './green-alt-types';

export type { GreenAlternativeEntry, GreenAlternativeSuggestion, GreenLocale };

/**
 * 覆盖常见高环境影响品类。顺序即匹配优先级 —
 * 更具体的品类放前面 (未来如有重叠 trigger, 前面的先命中)。
 * 穿戴/工艺在前 ("真皮草" 先命中皮草而非真皮), 家居/日用居中, 美妆个护在后。
 */
export const GREEN_ALTERNATIVES: readonly GreenAlternativeEntry[] = [
  ...GREEN_ALT_ENTRIES_WEAR,
  ...GREEN_ALT_ENTRIES_HOME,
  ...GREEN_ALT_ENTRIES_BEAUTY,
  ...GREEN_ALT_ENTRIES_ELECTRONICS,
  ...GREEN_ALT_ENTRIES_FOOD,
  ...GREEN_ALT_ENTRIES_APPAREL,
  ...GREEN_ALT_ENTRIES_HOUSEHOLD,
  ...GREEN_ALT_ENTRIES_SUBSCRIPTION,
  ...GREEN_ALT_ENTRIES_TRAVEL,
  ...GREEN_ALT_ENTRIES_PARENTING,
  ...GREEN_ALT_ENTRIES_SPORTS,
  ...GREEN_ALT_ENTRIES_GIFTING,
  ...GREEN_ALT_ENTRIES_FURNITURE,
  ...GREEN_ALT_ENTRIES_PET_FIRST_CARE,
  ...GREEN_ALT_ENTRIES_PETS,
  ...GREEN_ALT_ENTRIES_GARDEN,
  ...GREEN_ALT_ENTRIES_OFFICE,
  ...GREEN_ALT_ENTRIES_DIGITAL_CONTENT,
  ...GREEN_ALT_ENTRIES_HEALTH_CARE,
  ...GREEN_ALT_ENTRIES_REPAIR_CARE,
  ...GREEN_ALT_ENTRIES_CELEBRATION,
];

/** en trigger 匹配用小写归一化 */
function normalizeQuery(query: string): string {
  return query.toLowerCase().replace(/\s+/g, " ").trim();
}

function matchEntry(
  normalized: string,
  entry: GreenAlternativeEntry,
): boolean {
  const allTriggers = [...entry.triggers.zh, ...entry.triggers.en];
  return allTriggers.some((t) => normalized.includes(t.toLowerCase()));
}

/**
 * 口语插入语兜底 (batch69-a): zh 口语在动宾间插量词/形容词 ("买个沙发") 会
 * 断开刚性子串匹配。仅当原文零命中时, 用 normalizeGreenQuery 剥离插入语再试。
 * 先原文后归一化保证既有命中零回退 — "买新课 / 换新机" 里的 "新" 是语义负载词,
 * 原文命中不会被归一化路径改写; en 查询归一化恒等, 天然跳过。
 */
function matchColloquial(normalized: string): GreenAlternativeEntry[] {
  const loose = normalizeGreenQuery(normalized);
  if (loose === normalized) return [];
  return GREEN_ALTERNATIVES.filter((entry) => matchEntry(loose, entry));
}

/**
 * 词表顺序返回全部命中词条 (batch62-b 拒绝偏好排序用, 纯函数)。
 * suggestAlternative 保持"先命中先赢"语义不变; 排序层在命中集合上重排。
 */
export function matchGreenAltEntries(query: string): GreenAlternativeEntry[] {
  if (typeof query !== "string") return [];
  const normalized = normalizeQuery(query);
  if (normalized.length === 0) return [];
  const strict = GREEN_ALTERNATIVES.filter((entry) =>
    matchEntry(normalized, entry),
  );
  if (strict.length > 0) return strict;
  return matchColloquial(normalized);
}

/** 词条 → locale 文案组装 (偏好排序层复用同一模板, 不另写拼接规则) */
export function composeGreenAltMessage(
  entry: GreenAlternativeEntry,
  locale: GreenLocale,
): GreenAlternativeSuggestion {
  return composeMessage(entry, locale);
}

function composeMessage(
  entry: GreenAlternativeEntry,
  locale: GreenLocale,
): GreenAlternativeSuggestion {
  const alternative = entry.alternative[locale];
  const reuse = entry.reuse[locale];
  const message =
    locale === "zh" ? `${alternative}${reuse}` : `${alternative} ${reuse}`;
  return {
    id: entry.id,
    alternative,
    reuse,
    message,
    why: entry.why[locale],
    options: entry.options[locale],
    reuseChannel: entry.reuseChannel[locale],
  };
}

/**
 * 在查询文本里找高环境影响品类, 命中则给替代 + 复用建议; 未命中返回 null。
 *
 * 纯函数: 只做字符串匹配, 不读库、不改状态、不抛异常 (空/异常输入一律 null)。
 * 绿色偏好开关 (symy_green_pref) 由调用方判断, 这里不做。
 *
 * @param query 用户消息或商品名 (中英混排均可)
 * @param locale 输出文案语言, 默认 zh
 */
export function suggestAlternative(
  query: string,
  locale: GreenLocale = "zh",
): GreenAlternativeSuggestion | null {
  if (typeof query !== "string" || query.trim().length === 0) return null;
  const normalized = normalizeQuery(query);
  if (normalized.length === 0) return null;
  const hit =
    GREEN_ALTERNATIVES.find((entry) => matchEntry(normalized, entry)) ??
    matchColloquial(normalized)[0];
  return hit ? composeMessage(hit, locale) : null;
}
