/**
 * html-to-image loader — npm 本地打包版 (P0 分享卡修复)
 *
 * 旧实现: 运行时动态 import 第三方公共 CDN — 国内时好时坏,
 *   分享卡 PNG 生成随机失败 (根因已定位: CDN 不可达)。
 * 新实现: npm 依赖 html-to-image@1.11.13 (~30KB gzip), 本地 dynamic import() —
 *   bundler 会打进独立 async chunk, 运行时零外网依赖。
 *
 * 模块级缓存: 成功后复用; 失败清缓存允许下次 (重试按钮) 再尝试。
 */

export interface HtmlToImageModule {
  toPng: (node: HTMLElement, options?: Record<string, unknown>) => Promise<string>;
}

let cached: Promise<HtmlToImageModule> | null = null;

export function loadHtmlToImage(): Promise<HtmlToImageModule> {
  if (!cached) {
    cached = (async () => {
      // 本地 npm 包 — 无 webpackIgnore/turbopackIgnore, bundler 正常打包
      const mod = await import('html-to-image');
      const toPng = (mod as { toPng?: HtmlToImageModule['toPng'] }).toPng;
      if (typeof toPng !== 'function') {
        throw new Error('html-to-image: toPng missing from local bundle');
      }
      return { toPng: toPng.bind(mod) };
    })();
    // 失败后清缓存 — 下次调用 (用户点重试) 重新尝试加载
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}
