/**
 * GreenAltCardData — 绿色替代卡片线格式
 *
 * chat route 在发 Letta 前做关键词预检 (green-alternatives 词库),
 * 命中高环境影响品类且绿色守护开启时:
 * - 流式路径: SSE 流最前面注入 { type: 'green_alt', greenAlt: ... } 事件
 * - 非流式路径: JSON 响应带 greenAlt 字段
 * ChatBubble 据此在 AI 回复气泡下方渲染 GreenAltCard (纯建议, 无商城链接)。
 */
export interface GreenAltCardData {
  /** 命中的品类 id (埋点/测试用) */
  id: string;
  /** 为什么环境影响高 (一句, 不说教, 无碳数值) */
  why: string;
  /** 2-3 个具体绿色替代选项 */
  options: string[];
  /** 复用建议 ("你手头可能已有X") */
  reuse: string;
  /** 二手/租赁渠道建议 (zh 场景含平台名, 如闲鱼) */
  reuseChannel: string;
}
