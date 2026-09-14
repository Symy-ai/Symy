/**
 * Intercept Medal — 拦截勋章分享卡数据类型
 *
 * 产品叙事 (绿色转向): 用户被 Symy 拦下来（没买冲动消费品）这件事 = 可晒的勋章。
 * 省钱 = 羞耻 → 绿色 = 荣誉。分享卡是传播引擎的核心载体。
 *
 * 数据来源: complete_challenge (status='passed') 工具结果 — savedAmount + itemName。
 * record_impulse 是"买了" (impulse_damage), 不是拦截, 不产生勋章。
 * 红线: 零 DDL — 勋章数据只在客户端 session 内流转 (CustomEvent + state), 不落新表。
 */

import type { InterceptReason } from "@/lib/intercept-reason";

export interface InterceptMedalData {
  /** 被拦下的商品名 (challenge item_name; 空串时卡片隐藏商品 chip) */
  itemTitle: string;
  /** 省下的金额, 单位: 分 (展示层按 locale 转 ¥/$) */
  savedCents: number;
  /** 拦截时刻 ISO 字符串 (缺省 = 打开卡片时的当前时间) */
  date?: string;
  /** 是否选择了更绿的选择 (预留字段 — 现阶段无数据源, 组件支持展示) */
  greenSaved?: boolean;
  /** 用户昵称 (可选, 现阶段 buddy state 无此数据) */
  userName?: string;
  /** 拦截理由 (可选; 缺省时展示层可按 itemTitle 本地分类兜底) */
  reason?: InterceptReason;
}
