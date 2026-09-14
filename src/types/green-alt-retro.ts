/**
 * GreenAltRetroCardData — 绿色采纳后复盘卡线格式 (batch68-a)
 *
 * 上一条 assistant 消息的绿色替代卡被采纳后, 下一轮非购买/非紧急/非问账
 * 消息触发复盘追问轮:
 * - 流式路径: SSE 流最前注入 { type: 'green_alt_retro', greenAltRetro: ... } 事件
 * - 非流式路径: JSON 响应带 greenAltRetro 字段
 * ChatBubble 据此在 AI 回复气泡下方渲染 GreenAltRetroCard (4 个非羞辱选项 +
 * 自由文本提示)。选项文案在客户端 i18n (chat.greenAltRetro.option.*), 线格式
 * 只传选项 id — 复盘面零金额零碳数值。
 */

import type { GreenAltRetroOptionId } from '@/lib/green-alt-retro';

export interface GreenAltRetroCardData {
  /** 被采纳的绿色替代词条 id */
  entryId: string;
  /** 4 个非羞辱选项 (固定顺序, 客户端按 id 取 i18n 文案) */
  options: GreenAltRetroOptionId[];
}
