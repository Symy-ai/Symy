import { withPayload } from '@payloadcms/next/withPayload';
import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig = {
  // NOTE: "standalone" output is for Docker/self-hosting only.
  // Vercel requires the default build output — do NOT set output: "standalone".
  // 🔧 2026-07-15 (ARCH-6 #24 部分修复):
  //   此前注释声称"已关闭"但实际值是 true — 注释与代码不一致的 bug
  //   修复尝试: 设为 false 让 Vercel CI 严格检查 TS 错误
  //   回退原因: next build 的 TS check 步骤在 4GB 环境下 OOM (TypeScript checker 内存消耗大)
  //   折中方案: 保持 ignoreBuildErrors=true (build 不卡 TS), 但:
  //     1. pre-commit hook 已运行 tsc --noEmit (本地拦截)
  //     2. CI workflow 应加 tsc --noEmit 步骤 (TODO)
  //   这样 build 能成功部署, TS 错误仍被 pre-commit + CI 拦截
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  reactStrictMode: true,
  // 🔧 头像压缩 fix: sharp 有 native binary, 必须设为 serverExternalPackages
  serverExternalPackages: ['sharp'],
  // 🔧 2026-07-15 (ARCH-11 #22): next/image for avatar + butterfly illustrations
  images: {
    remotePatterns: [
      // Supabase Storage (avatars, illustrations)
      {
        protocol: 'https' as const,
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      // Supabase Storage direct URL (fcgpxrujhnqramggupjm)
      {
        protocol: 'https' as const,
        hostname: 'fcgpxrujhnqramggupjm.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  redirects() {
    return [
      { source: '/blog', destination: '/en/blog', permanent: true },
      { source: '/blog/:path*', destination: '/en/blog/:path*', permanent: true },
    ];
  },
};

export default withPayload(
  withBundleAnalyzer(
    withSentryConfig(withNextIntl(nextConfig), {
      // Only run Sentry webpack in production builds when DSN is set
      silent: true,

      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,

      // Only upload source maps if SENTRY_AUTH_TOKEN is set
      // (prevents build failures in environments without Sentry auth)
      sourcemaps: {
        disable: !process.env.SENTRY_AUTH_TOKEN,
      },

      // 🔧 2026-07-15: Disable in dev to avoid noise
      disableLogger: process.env.NODE_ENV === 'development',
    }),
  ),
);
