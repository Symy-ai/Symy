/**
 * duplicate-purchase 类型 — 「要不要再买一个」重复购买决策卡的 payload。
 *
 * 📌 b134 / 方案 A 的关系注释（b132 侦察 §1.2 第三处发现，b131 误记为「缺 clothing/beauty 的
 * 词表漏配」——**不是**）：本枚举是四档的**物品形态归并**特化投影，不是品类枚举的残缺版。
 *   - 上游 `duplicate-purchase-detect.ts` 的 `ITEM_RULES` 枚举的是**具体可复用物品形态**
 *     （数据线/充电宝、调味品/香料、收纳盒/整理箱、会员/订阅/包装纸），不是品类；
 *   - 由 `categoryFor()` 把物品形态**向上归并**成四档，无命中一律 `return 'other'`；
 *   - **clothing / beauty 落 `other` 是设计使然，不是缺失**：该卡只对「可复用/可续费的具体物品」
 *     触发，衣/美妆无稳定复用语义（衣服可穿、化妆品会过期），强行造第五/第六档会让衣/美妆物品
 *     触发一张无意义的「可复用」卡 —— 这正是 b132 方案 B（统一成五档）被否决的原因。
 *   - `other` 在此是**兜底桶**（硬编码 return），不是「待补的第六类」。
 *
 * 与其他三个品类枚举的关系（b132 §1.3 全景）：
 *   DuplicatePrecheckCategory ⊂ GuardInsightCategory（= InterceptCategory | 'other'）
 * 该子集关系由 `src/app/api/chat/parts/__tests__/category-keywords-guard.test.ts` 的四枚举关系
 * 用例锁死，防未来漂移。⚠️ 往这里加档 = 改卡片触发语义（行为变化），不是补漏。
 */

/** 重复购买卡的品类 — 物品形态归并后的四档（'other' 为兜底桶，非品类缺失） */
export type DuplicatePrecheckCategory = 'electronics' | 'food' | 'home' | 'other';

export type DuplicatePrecheckDecision = 'reuse' | 'wait';

export interface DuplicatePrecheckCardData {
  itemTitle: string;
  category: DuplicatePrecheckCategory;
}

export interface DuplicatePrecheckEvent {
  id: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}
