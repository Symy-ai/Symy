/**
 * GreenKnowledgeCardData — 绿色知识问答来源 chip 线格式
 *
 * chat route 检测到知识型提问 (green-knowledge-query 命中词条) 且绿色守护开启时:
 * - 流式路径: SSE 流最前面注入 { type: 'green_knowledge', greenKnowledge: ... } 事件
 * - 非流式路径: JSON 响应带 greenKnowledge 字段
 * ChatBubble 据此在 AI 回复气泡下方渲染 GreenKnowledgeChip (可展开替代选项/渠道, 零金额)。
 */
export interface GreenKnowledgeEntryData {
  /** 命中的词条 id */
  id: string;
  /** 词条展示名 (locale 语言, chip 文案用) */
  label: string;
  /** 为什么环境影响高 (一句, 不说教, 无碳数值) */
  why: string;
  /** 2-3 个具体绿色替代选项 */
  options: string[];
  /** 二手/租赁渠道建议 */
  reuseChannel: string;
}

export interface GreenKnowledgeCardData {
  entries: GreenKnowledgeEntryData[];
}
