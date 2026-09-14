/**
 * LandingHeroImage — 落地页 Hero 图 (Server Component)
 *
 * 🔧 SEO fix (2026-08-06): 落地页是 'use client' (hooks), 但搜索引擎爬虫只看 SSR HTML。
 *   旧代码: <img> 在 client component 内 → SSR HTML 无 img 标签 → 爬虫看不到图片。
 *   修复: 提取为 Server Component, 用 next/image 渲染, SSR 输出 <img>。
 *
 * 注意: Server Component 不能 import 到 "use client" 文件再传 client props —
 *   但可以静态引用。这里的 width/height 与旧视觉一致 (w-24 h-24 ≈ 96px, 原图 280x186)。
 */

import Image from 'next/image';

export function LandingHeroImage() {
  return (
    <Image
      src="/symy-elephant-dark.png"
      alt="Symy — Buy less. Live more."
      width={280}
      height={186}
      priority
      className="w-full h-auto [filter:drop-shadow(0_0_4px_rgba(255,255,255,0.9))_drop-shadow(0_0_8px_rgba(255,255,255,0.6))_drop-shadow(0_0_16px_rgba(255,255,255,0.3))]"
    />
  );
}
