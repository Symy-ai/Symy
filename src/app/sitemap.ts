import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://symy.ai';
  const locales = ['en', 'zh'];
  const now = new Date();

  // Public pages that should be indexed
  const publicPaths = [
    { path: '', priority: 1, changeFreq: 'weekly' },
    { path: '/blog', priority: 0.8, changeFreq: 'weekly' },
    { path: '/blog/algorithm-decode-001', priority: 0.7, changeFreq: 'monthly' },
    { path: '/blog/the-prison-of-attachment', priority: 0.7, changeFreq: 'monthly' },
    // 内容引擎的搜索引擎面 (batch86-a): 周报页周更, 财务页月更 (owner 手动月更)
    { path: '/transparency', priority: 0.8, changeFreq: 'weekly' },
    { path: '/transparency/finance', priority: 0.7, changeFreq: 'monthly' },
    { path: '/butterfly-demo', priority: 0.6, changeFreq: 'monthly' },
    { path: '/landing', priority: 0.8, changeFreq: 'monthly' },
    { path: '/legal/privacy', priority: 0.3, changeFreq: 'yearly' },
    { path: '/legal/terms', priority: 0.3, changeFreq: 'yearly' },
  ];

  const entries: MetadataRoute.Sitemap = [];

  for (const locale of locales) {
    for (const { path, priority, changeFreq } of publicPaths) {
      entries.push({
        url: `${baseUrl}/${locale}${path}`,
        lastModified: now,
        changeFrequency: changeFreq as 'weekly' | 'monthly' | 'yearly',
        priority,
        alternates: {
          languages: {
            en: `${baseUrl}/en${path}`,
            zh: `${baseUrl}/zh${path}`,
          },
        },
      });
    }
  }

  return entries;
}
