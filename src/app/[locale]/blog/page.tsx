import type { Metadata } from 'next';
import Link from 'next/link';
import { Clock, Calendar, ArrowRight, ArrowLeft } from 'lucide-react';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isZh = locale === 'zh';

  const title = isZh ? '博客 — 算法解构 | Symy' : 'Blog — Algorithm Decode | Symy';
  const description = isZh
    ? '《算法解构》是 Symy 的系列文章，揭露平台算法如何操纵你的购买决策 —— 并教你如何在付款前看穿它们。'
    : "Algorithm Decode is Symy's series on how platform algorithms manipulate your purchase decisions — and how to see through them before you pay.";
  const ogDescription = isZh
    ? '我们解构冲动消费背后的机制 —— 稀缺倒计时、暗黑模式、可变奖励 —— 并武装你的心智去对抗它们。'
    : 'We decode the mechanics behind impulsive buying — scarcity timers, dark patterns, variable rewards — and arm your mind against them.';
  const twitterDescription = isZh
    ? '我们解构冲动消费背后的机制 —— 并武装你的心智去对抗它们。'
    : 'We decode the mechanics behind impulsive buying — and arm your mind against them.';

  return {
    title,
    description,
    alternates: { canonical: '/blog' },
    openGraph: {
      title,
      description: ogDescription,
      url: 'https://symy.ai/blog',
      siteName: 'Symy',
      type: 'website',
      images: [{ url: '/icon-1024.png', width: 1024, height: 1024, alt: 'Symy logo' }],
    },
    twitter: {
      card: 'summary',
      title,
      description: twitterDescription,
      images: ['/icon-1024.png'],
    },
  };
}

export default async function BlogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const isZh = locale === 'zh';

  return (
    <main className="relative min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Decorative aurora glows */}
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute top-1/3 -right-24 h-96 w-96 rounded-full bg-teal-500/10 blur-[120px]" />
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-emerald-500/5 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl px-6 py-16 sm:py-20">
        {/* Top nav */}
        <nav className="mb-14 flex items-center justify-between">
          <Link
            href={`/${locale}`}
            className="inline-flex items-center gap-1.5 text-sm text-text-tertiary transition-colors hover:text-text-primary"
          >
            <ArrowLeft size={16} aria-hidden />
            {isZh ? '返回 Symy' : 'Back to Symy'}
          </Link>
          <span className="text-xs font-mono uppercase tracking-widest text-emerald-400">Symy</span>
        </nav>

        {/* Hero */}
        <header className="mb-14">
          <span className="inline-flex items-center gap-2 rounded-full glass-card px-3 py-1 text-xs font-semibold text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
            {isZh ? 'Symy 手记' : 'The Symy Journal'}
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            {isZh ? (
              <>
                算法<span className="gradient-text">解构</span>
              </>
            ) : (
              <>
                Algorithm <span className="gradient-text">Decode</span>
              </>
            )}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-text-secondary sm:text-lg">
            {isZh
              ? '互联网的上半场用算法煽动贪婪、愤怒与欲望。我们逐一拆解这些机制 —— 一次一种冲动 —— 让 Symy 替你守住每一个决策关口。'
              : 'The top half of the internet uses algorithms to excite greed, anger, and desire. We tear those mechanisms apart — one impulse at a time — so Symy can guard every decision point with you.'}
          </p>
        </header>

        {/* Post list */}
        <section aria-label="Articles" className="space-y-5">
          <Link
            href={`/${locale}/blog/the-prison-of-attachment`}
            className="group block glass-card rounded-2xl p-6 transition-colors hover:bg-glass-fill-strong sm:p-8"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono uppercase tracking-widest text-emerald-400">
                {isZh ? '自在之心' : 'The Unbound Mind'}
              </span>
              <span className="rounded-full bg-glass-fill px-2.5 py-0.5 font-medium text-text-tertiary">
                {isZh ? '行为设计' : 'Behavioral Design'}
              </span>
            </div>
            <h2 className="mt-3 text-xl font-bold leading-snug text-text-primary transition-colors group-hover:text-emerald-300 sm:text-2xl">
              {isZh
                ? '执念之牢：对失去的恐惧如何控制你'
                : 'The Prison of Attachment: How the Fear of Loss Controls You'}
            </h2>
            <p className="mt-3 text-sm leading-6 text-text-secondary sm:text-base">
              {isZh
                ? '困住我们的不是失去，而是对失去的恐惧。损失厌恶、沉没成本谬误，以及如何不再把操控你的把柄交到别人手里。'
                : 'It is not loss that traps us — it is the fear of it. Loss aversion, the sunk cost fallacy, and how to stop handing other people the handle they use to run you.'}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-tertiary">
              <span className="inline-flex items-center gap-1.5">
                <Clock size={14} aria-hidden />
                {isZh ? '8 分钟阅读' : '8 min read'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={14} aria-hidden />
                {isZh ? '2026 年 8 月 6 日' : 'August 6, 2026'}
              </span>
              <span className="ml-auto inline-flex items-center gap-1 font-semibold text-emerald-400 transition-transform group-hover:translate-x-0.5">
                {isZh ? '阅读文章' : 'Read article'}
                <ArrowRight size={14} aria-hidden />
              </span>
            </div>
          </Link>
          <Link
            href={`/${locale}/blog/algorithm-decode-001`}
            className="group block glass-card rounded-2xl p-6 transition-colors hover:bg-glass-fill-strong sm:p-8"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono uppercase tracking-widest text-emerald-400">
                {isZh ? '算法解构 · 001' : 'Algorithm Decode · 001'}
              </span>
              <span className="rounded-full bg-glass-fill px-2.5 py-0.5 font-medium text-text-tertiary">
                {isZh ? '行为设计' : 'Behavioral Design'}
              </span>
            </div>
            <h2 className="mt-3 text-xl font-bold leading-snug text-text-primary transition-colors group-hover:text-emerald-300 sm:text-2xl">
              {isZh
                ? 'FOMO 倒计时：TikTok Shop 如何制造虚假紧迫感'
                : 'The FOMO Timer: How TikTok Shop Creates False Urgency'}
            </h2>
            <p className="mt-3 text-sm leading-6 text-text-secondary sm:text-base">
              {isZh
                ? '倒计时、限时秒杀，以及错失恐惧的心理。本文揭示社交电商如何制造紧迫感 —— 以及三个能在你付款前识破假截止日期的信号。'
                : "Here's how social commerce engineers urgency — and the three signals that expose a fake deadline before you pay."}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-tertiary">
              <span className="inline-flex items-center gap-1.5">
                <Clock size={14} aria-hidden />
                {isZh ? '9 分钟阅读' : '9 min read'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={14} aria-hidden />
                {isZh ? '2026 年 8 月 5 日' : 'August 5, 2026'}
              </span>
              <span className="ml-auto inline-flex items-center gap-1 font-semibold text-emerald-400 transition-transform group-hover:translate-x-0.5">
                {isZh ? '阅读文章' : 'Read article'}
                <ArrowRight size={14} aria-hidden />
              </span>
            </div>
          </Link>
        </section>

        {/* Bottom CTA */}
        <section className="mt-16 glass-card rounded-2xl p-8 text-center">
          <h2 className="text-2xl font-bold text-text-primary">
            {isZh ? '与 Symy 一同启程' : 'Start your journey with Symy'}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-secondary">
            {isZh
              ? '不是记账应用，而是守护伙伴。意志力输给算法 —— 守护则不会。'
              : "Not a budgeting app. A guardian buddy. Willpower loses to algorithms — guardianship doesn't."}
          </p>
          <Link
            href={`/${locale}`}
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 px-8 py-3.5 font-semibold text-white transition-all hover:from-emerald-300 hover:to-teal-400 active:scale-[0.98] btn-shimmer"
          >
            {isZh ? '免费开始' : 'Get started free'}
          </Link>
        </section>

        {/* Footer */}
        <footer className="mt-12 text-center">
          <p className="text-[10px] text-text-tertiary">
            {isZh ? '© 2026 Symy — 少买，多活。' : '© 2026 Symy — Buy less, live more.'}
          </p>
        </footer>
      </div>
    </main>
  );
}
