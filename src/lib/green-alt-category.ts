/**
 * green-alt-category — 绿色替代采纳的分类归属 (纯函数, 零 IO)
 *
 * 采纳记录按词条来源归类: wear (穿戴/工艺品) / home (家居/日用) / beauty (美妆/个护)
 * / electronics (3C 数码) / food (食品饮品) / apparel (服饰鞋包) / household (居家生活)
 * / subscription (订阅与虚拟消费) / travel (出行与旅行)
 * / parenting (母婴亲子) / sports (运动户外) / furniture (家具大件耐用品)
 * / digital-content (数字内容) / health-care (健康与个护) / repair-care (维修与再利用)
 * / celebration (庆典与礼赠)。
 * / pet-first-care (第一次养宠物)。
 * 词条 id 全集来自 GREEN_ALTERNATIVES, 供 API route 校验 entryId 用。
 * 未知 id 归 'other' (GET 聚合容错), POST 校验则直接拒绝。
 */

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

export type GreenAltCategory = 'wear' | 'home' | 'beauty' | 'electronics' | 'food' | 'apparel' | 'household' | 'subscription' | 'travel' | 'parenting' | 'sports' | 'gifting' | 'furniture' | 'pets' | 'garden' | 'office' | 'digital-content' | 'health-care' | 'repair-care' | 'celebration' | 'pet-first-care' | 'other';

const WEAR_IDS = new Set(GREEN_ALT_ENTRIES_WEAR.map((e) => e.id));
const HOME_IDS = new Set(GREEN_ALT_ENTRIES_HOME.map((e) => e.id));
const BEAUTY_IDS = new Set(GREEN_ALT_ENTRIES_BEAUTY.map((e) => e.id));
const ELECTRONICS_IDS = new Set(GREEN_ALT_ENTRIES_ELECTRONICS.map((e) => e.id));
const FOOD_IDS = new Set(GREEN_ALT_ENTRIES_FOOD.map((e) => e.id));
const APPAREL_IDS = new Set(GREEN_ALT_ENTRIES_APPAREL.map((e) => e.id));
const HOUSEHOLD_IDS = new Set(GREEN_ALT_ENTRIES_HOUSEHOLD.map((e) => e.id));
const SUBSCRIPTION_IDS = new Set(GREEN_ALT_ENTRIES_SUBSCRIPTION.map((e) => e.id));
const TRAVEL_IDS = new Set(GREEN_ALT_ENTRIES_TRAVEL.map((e) => e.id));
const PARENTING_IDS = new Set(GREEN_ALT_ENTRIES_PARENTING.map((e) => e.id));
const SPORTS_IDS = new Set(GREEN_ALT_ENTRIES_SPORTS.map((e) => e.id));
const GIFTING_IDS = new Set(GREEN_ALT_ENTRIES_GIFTING.map((e) => e.id));
const FURNITURE_IDS = new Set(GREEN_ALT_ENTRIES_FURNITURE.map((e) => e.id));
const PETS_IDS = new Set(GREEN_ALT_ENTRIES_PETS.map((e) => e.id));
const GARDEN_IDS = new Set(GREEN_ALT_ENTRIES_GARDEN.map((e) => e.id));
const OFFICE_IDS = new Set(GREEN_ALT_ENTRIES_OFFICE.map((e) => e.id));
const DIGITAL_CONTENT_IDS = new Set(GREEN_ALT_ENTRIES_DIGITAL_CONTENT.map((e) => e.id));
const HEALTH_CARE_IDS = new Set(GREEN_ALT_ENTRIES_HEALTH_CARE.map((e) => e.id));
const REPAIR_CARE_IDS = new Set(GREEN_ALT_ENTRIES_REPAIR_CARE.map((e) => e.id));
const CELEBRATION_IDS = new Set(GREEN_ALT_ENTRIES_CELEBRATION.map((e) => e.id));
const PET_FIRST_CARE_IDS = new Set(GREEN_ALT_ENTRIES_PET_FIRST_CARE.map((e) => e.id));

/** entryId 是否为已知绿色替代词条 (POST 校验用) */
export function isKnownGreenAltEntry(entryId: string): boolean {
  return (
    WEAR_IDS.has(entryId) ||
    HOME_IDS.has(entryId) ||
    BEAUTY_IDS.has(entryId) ||
    ELECTRONICS_IDS.has(entryId) ||
    FOOD_IDS.has(entryId) ||
    APPAREL_IDS.has(entryId) ||
    HOUSEHOLD_IDS.has(entryId) ||
    SUBSCRIPTION_IDS.has(entryId) ||
    TRAVEL_IDS.has(entryId) ||
    PARENTING_IDS.has(entryId) ||
    SPORTS_IDS.has(entryId) ||
    GIFTING_IDS.has(entryId) ||
    FURNITURE_IDS.has(entryId) ||
    PETS_IDS.has(entryId) ||
    GARDEN_IDS.has(entryId) ||
    OFFICE_IDS.has(entryId) ||
    DIGITAL_CONTENT_IDS.has(entryId) ||
    HEALTH_CARE_IDS.has(entryId) ||
    REPAIR_CARE_IDS.has(entryId) ||
    CELEBRATION_IDS.has(entryId) ||
    PET_FIRST_CARE_IDS.has(entryId)
  );
}

/** 按词条来源归类 (GET 聚合容错: 未知 id 归 other) */
export function greenAltCategoryOf(entryId: string): GreenAltCategory {
  if (WEAR_IDS.has(entryId)) return 'wear';
  if (HOME_IDS.has(entryId)) return 'home';
  if (BEAUTY_IDS.has(entryId)) return 'beauty';
  if (ELECTRONICS_IDS.has(entryId)) return 'electronics';
  if (FOOD_IDS.has(entryId)) return 'food';
  if (APPAREL_IDS.has(entryId)) return 'apparel';
  if (HOUSEHOLD_IDS.has(entryId)) return 'household';
  if (SUBSCRIPTION_IDS.has(entryId)) return 'subscription';
  if (TRAVEL_IDS.has(entryId)) return 'travel';
  if (PARENTING_IDS.has(entryId)) return 'parenting';
  if (SPORTS_IDS.has(entryId)) return 'sports';
  if (GIFTING_IDS.has(entryId)) return 'gifting';
  if (FURNITURE_IDS.has(entryId)) return 'furniture';
  if (PETS_IDS.has(entryId)) return 'pets';
  if (GARDEN_IDS.has(entryId)) return 'garden';
  if (OFFICE_IDS.has(entryId)) return 'office';
  if (DIGITAL_CONTENT_IDS.has(entryId)) return 'digital-content';
  if (HEALTH_CARE_IDS.has(entryId)) return 'health-care';
  if (REPAIR_CARE_IDS.has(entryId)) return 'repair-care';
  if (CELEBRATION_IDS.has(entryId)) return 'celebration';
  if (PET_FIRST_CARE_IDS.has(entryId)) return 'pet-first-care';
  return 'other';
}
