import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { I18nProviderWrapper } from "@/i18n/provider";
import type { Locale } from "@/i18n/config";
import { routing } from "@/i18n/routing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isZh = locale === "zh";

  const title = isZh
    ? "Symy — 少买一点，多活一点。"
    : "Symy — Buy less. Live more.";
  const description = isZh
    ? "Symy 是你的 AI 绿色消费助手——买之前替你和地球把好绿色关：绿色优先、非绿替代、复用优先。少买一点，多活一点。"
    : "Symy is your AI green-shopping companion — it holds the green gate before you buy: green first, greener alternatives, reuse first. Buy less, waste less, live more.";
  const ogDescription = isZh
    ? "Symy 是你的 AI 绿色消费助手。买之前把好绿色关，每一次拦截都是可以晒的勋章。"
    : "Your AI green-shopping companion. Every guarded choice is a medal you can share.";

  return {
    metadataBase: new URL("https://symy.ai"),
    alternates: {
      canonical: `/${locale}`,
      languages: {
        en: "/en",
        zh: "/zh",
      },
    },
    title,
    description,
    keywords: ["Symy", "symy.ai", "buy less live more", "green shopping assistant", "sustainable shopping", "eco-friendly shopping", "mindful consumption", "de-influencing", "green consumption", "AI shopping companion", "绿色消费", "绿色购物", "可持续消费", "理性消费", "绿色消费助手"],
    authors: [{ name: "Symy" }],
    icons: {
      icon: [
        { url: "/favicon-32.png", sizes: "48x48", type: "image/png" },
        { url: "/favicon-32-dark.png", sizes: "48x48", type: "image/png", media: "(prefers-color-scheme: dark)" },
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-192-dark.png", sizes: "192x192", type: "image/png", media: "(prefers-color-scheme: dark)" },
      ],
      apple: [
        { url: "/apple-touch-icon.png" },
        { url: "/apple-touch-icon-dark.png", media: "(prefers-color-scheme: dark)" },
      ],
    },
    manifest: "/manifest.json",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Symy",
    },
    // Bug #18: 添加 Open Graph + Twitter Card meta tags
    openGraph: {
      title,
      description: ogDescription,
      url: "https://symy.ai",
      siteName: "Symy",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: ogDescription,
      images: [{ url: `/${locale}/og`, width: 1200, height: 630 }],
    },
    robots: { index: true, follow: true },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Symy',
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Web, Android, iOS',
  url: 'https://symy.ai',
  description:
    'Symy is your AI green-shopping companion — it holds the green gate before you buy: green first, greener alternatives, reuse first. Buy less, waste less, live more.',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  publisher: {
    '@type': 'Organization',
    name: 'Symy',
    url: 'https://symy.ai',
  },
};

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  const messages = await getMessages();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:rounded focus:bg-white focus:text-black focus:shadow-lg"
      >
        Skip to main content
      </a>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <I18nProviderWrapper initialLocale={locale as Locale} initialMessages={messages}>
          <div id="main-content">
            {children}
          </div>
        </I18nProviderWrapper>
      </NextIntlClientProvider>
    </>
  );
}
