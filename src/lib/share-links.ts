/**
 * share-links — 分享直链构造纯函数 (batch106-a, BP p19 传播层)
 *
 * 平台能力如实分级 (别造假按钮):
 *   - X / Reddit: 有 web intent → 文案+URL 预填的直链
 *   - Instagram / TikTok: 无 web intent → 只提供 app 主页, 由调用方走
 *     「保存图片 + 复制文案」诚实降级 (UI 层 direct-share-row)
 *
 * 纯字符串拼接, 无 DOM/网络依赖; encodeURIComponent 全参编码,
 * 文案里的 & # 空格换行与 CJK 都不会截断 intent 参数。
 */

export interface ShareLinkParams {
  /** 分享文案 (面子数字, 永无金额) */
  text: string;
  /** 分享链接 (带 ref 归因) */
  url: string;
}

/** X (Twitter) 发帖 intent — x.com 域当前端点; 文案与链接分开传, 平台侧自动拼接预览卡 */
export function buildXIntentUrl({ text, url }: ShareLinkParams): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

/** Reddit 提交直链 — title 带文案, url 带链接 */
export function buildRedditSubmitUrl({ text, url }: ShareLinkParams): string {
  return `https://www.reddit.com/submit?title=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

/** 无 web intent 平台的诚实降级目标 — app 主页 (调用方负责先存图/复制文案) */
export const INSTAGRAM_HOME_URL = 'https://www.instagram.com/';
export const TIKTOK_HOME_URL = 'https://www.tiktok.com/';
