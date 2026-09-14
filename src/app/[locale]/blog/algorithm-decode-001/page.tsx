import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Clock, Calendar, Check } from 'lucide-react';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isZh = locale === 'zh';

  const title = isZh
    ? '算法解构 1：FOMO 倒计时 —— TikTok Shop 如何制造虚假紧迫感 | Symy'
    : 'Algorithm Decode 1: The FOMO Timer — How TikTok Shop Creates False Urgency | Symy';
  const description = isZh
    ? '倒计时、限时秒杀，以及错失恐惧的心理。社交电商如何制造虚假紧迫感 —— 以及三个能在你付款前识破假截止日期的信号。'
    : 'Countdowns, flash sales, and the psychology of missing out. How social commerce engineers false urgency — and the three signals that expose a fake deadline before you pay.';
  const ogTitle = isZh
    ? '算法解构 1：FOMO 倒计时 —— TikTok Shop 如何制造虚假紧迫感'
    : 'Algorithm Decode 1: The FOMO Timer — How TikTok Shop Creates False Urgency';
  const ogDescription = isZh
    ? '倒计时、限时秒杀，以及错失恐惧的心理。社交电商如何制造虚假紧迫感 —— 以及三个能识破假截止日期的信号。'
    : 'Countdowns, flash sales, and the psychology of missing out. How social commerce engineers false urgency — and the three signals that expose a fake deadline.';
  const twitterDescription = isZh
    ? '社交电商如何制造虚假紧迫感 —— 以及三个能识破假截止日期的信号。'
    : 'How social commerce engineers false urgency — and the three signals that expose a fake deadline.';
  const keywords = isZh
    ? ['FOMO', 'TikTok Shop', '稀缺原则', '损失厌恶', 'Cialdini', '冲动消费', '行为设计', '暗黑模式', '算法']
    : [
        'FOMO',
        'TikTok Shop',
        'scarcity principle',
        'loss aversion',
        'Cialdini',
        'impulse buying',
        'behavioral design',
        'dark patterns',
        'algorithm',
      ];
  const tags = isZh
    ? ['算法解构', 'FOMO', 'TikTok Shop', '稀缺', '行为设计', '冲动消费']
    : ['Algorithm Decode', 'FOMO', 'TikTok Shop', 'Scarcity', 'Behavioral Design', 'Impulse Buying'];

  return {
    title,
    description,
    alternates: { canonical: '/blog/algorithm-decode-001' },
    keywords,
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      url: 'https://symy.ai/blog/algorithm-decode-001',
      siteName: 'Symy',
      type: 'article',
      publishedTime: '2026-08-05',
      authors: ['Symy'],
      tags,
      images: [{ url: '/icon-1024.png', width: 1024, height: 1024, alt: 'Symy logo' }],
    },
    twitter: {
      card: 'summary',
      title: ogTitle,
      description: twitterDescription,
      images: ['/icon-1024.png'],
    },
  };
}

/* Small local prose helpers — plain Tailwind, no typography plugin needed */
function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-12 mb-4 text-2xl font-bold tracking-tight text-text-primary">{children}</h2>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-5 text-base leading-7 text-text-secondary">{children}</p>;
}

function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-text-primary">{children}</strong>;
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-base leading-7 text-text-secondary">
      <span className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

function SignalCard({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card rounded-xl p-5">
      <p className="mb-2 flex items-center gap-2 font-bold text-text-primary">
        <span className="font-mono text-sm text-emerald-400">{num}</span>
        {title}
      </p>
      <p className="text-sm leading-6 text-text-secondary">{children}</p>
    </div>
  );
}

function BuddyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
        <Check size={14} className="text-emerald-400" aria-hidden />
      </span>
      <div>
        <p className="text-sm font-bold text-text-primary">{label}</p>
        <p className="mt-0.5 text-sm leading-6 text-text-secondary">{children}</p>
      </div>
    </div>
  );
}

function BlockQuote({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="my-6 border-l-2 border-emerald-400/60 pl-5 text-base leading-7 text-text-secondary italic">
      {children}
    </blockquote>
  );
}

export default async function AlgorithmDecode001Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isZh = locale === 'zh';

  return (
    <main className="relative min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Decorative aurora glows */}
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="absolute -top-24 left-1/4 h-80 w-80 rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute top-1/2 -right-20 h-96 w-96 rounded-full bg-teal-500/10 blur-[130px]" />
        <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-emerald-500/5 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-2xl px-6 py-16 sm:py-20">
        {/* Back link */}
        <nav className="mb-12">
          <Link
            href={`/${locale}/blog`}
            className="inline-flex items-center gap-1.5 text-sm text-text-tertiary transition-colors hover:text-text-primary"
          >
            <ArrowLeft size={16} aria-hidden />
            {isZh ? '返回博客' : 'Back to Blog'}
          </Link>
        </nav>

        {/* Header */}
        <header className="mb-12">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono uppercase tracking-widest text-emerald-400">
              {isZh ? '算法解构 · 001' : 'Algorithm Decode · 001'}
            </span>
            <span className="rounded-full bg-glass-fill px-2.5 py-0.5 font-medium text-text-tertiary">
              {isZh ? '行为设计' : 'Behavioral Design'}
            </span>
          </div>
          <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {isZh
              ? 'FOMO 倒计时：TikTok Shop 如何制造虚假紧迫感'
              : 'The FOMO Timer: How TikTok Shop Creates False Urgency'}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-tertiary">
            <span className="inline-flex items-center gap-1.5">
              <Calendar size={14} aria-hidden />
              {isZh ? '2026 年 8 月 5 日' : 'August 5, 2026'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock size={14} aria-hidden />
              {isZh ? '9 分钟阅读' : '9 min read'}
            </span>
          </div>
        </header>

        {/* Article body */}
        <article>
          <P>
            {isZh
              ? '你已经见过上百次了。一件你原本不知道自己想要的产品。一个冻结在 '
              : "You've seen it a hundred times. A product you didn't know you wanted. A countdown timer frozen at "}
            <Strong>00:12:47</Strong>
            {isZh ? ' 的倒计时。一根正爬向 ' : '. A stock bar creeping toward '}
            <Strong>{isZh ? '"仅剩 3 件"' : '“only 3 left.”'}</Strong>
            {isZh
              ? ' 的库存条。你的脉搏加速。你的拇指悬停在购买按钮上方。'
              : ' Your pulse quickens. Your thumb hovers over the buy button.'}
          </P>
          <P>
            {isZh
              ? '那个倒计时不是一个中立的事实。它是一项设计决策 —— 由挑选按钮颜色、视频长度和评论排序的同一批人调校而成。你的每一秒犹豫都会让平台损失一次转化，而倒计时存在的意义就是缩短那一秒。在《'
              : 'That timer is not a neutral fact. It is a design decision — tuned by the same people who pick the color of the button, the length of the video, and the order of the comments. Every second of hesitation costs the platform a conversion, and the timer exists to shorten that second. In the first installment of '}
            <Strong>{isZh ? '算法解构' : 'Algorithm Decode'}</Strong>
            {isZh
              ? '》的第一期里，我们拆解 FOMO 倒计时：社交电商用来把犹豫转化为冲动的稀缺机制，以及如何在上当之前看穿它。'
              : ', we take the FOMO Timer apart: the scarcity mechanic social commerce uses to convert hesitation into impulse, and how to see through it before you pay.'}
          </P>

          <H2>{isZh ? '什么是 FOMO 倒计时？' : 'What is a FOMO Timer?'}</H2>
          <P>
            <Strong>FOMO</Strong>
            {isZh ? ' 是 ' : ' stands for '}
            <Strong>Fear Of Missing Out</Strong>
            {isZh
              ? '（错失恐惧）的缩写 —— 一种机会正在溜走、除了你之外别人都得到了的焦虑。FOMO 倒计时是任何把这种焦虑武器化的屏幕倒计时或紧迫信号：'
              : ' — the anxiety that an opportunity is slipping away, and everyone else is getting it except you. A FOMO Timer is any on-screen countdown or urgency signal that weaponizes that anxiety: '}
            <em>{isZh ? '"此优惠 5 分钟后结束。"' : '“This deal ends in 5 minutes.”'}</em>{' '}
            <em>{isZh ? '"库存仅剩 2 件。"' : '“Only 2 left in stock.”'}</em>{' '}
            <em>{isZh ? '"午夜截止。"' : '“Sale ends at midnight.”'}</em>
          </P>
          <P>
            {isZh ? '这些都是教科书式的 ' : 'These are textbook '}
            <Strong>{isZh ? '稀缺策略' : 'scarcity tactics'}</Strong>
            {isZh
              ? ' —— 罗伯特·西奥迪尼在'
              : ' — one of the six principles of persuasion Robert Cialdini catalogued in '}
            <em>{isZh ? '《影响力》' : 'Influence'}</em>
            {isZh
              ? '中归纳的六大说服原则之一。当某样东西变得稀缺 —— 罕见、限量或限时 —— 我们就会赋予它更高的价值，并更快地去抢占它。稀缺感像是世界的一个事实。而在直播购物的信息流里，它只是某人拨动的一个开关。'
              : '. When something becomes scarce — rare, limited, or time-bound — we assign it more value and move faster to secure it. Scarcity feels like a fact of the world. On a live shopping feed, it is a setting someone toggled.'}
          </P>
          <P>
            {isZh
              ? 'FOMO 倒计时利用的正是这样一个特定的盲点：我们的大脑极擅长对截止时间做出反应，却极不擅长去核实它们。一个真实的截止时间 —— 航班起飞、一家实体打烊的店铺 —— 确实需要你赶时间，你在那些时刻的紧迫感是应得的。而人为制造的截止时间借用了同样的紧迫感，却没有任何底层的现实支撑。骗局不在于截止时间存在，而在于在那个当下，你分辨不出它究竟存不存在。'
              : 'The FOMO Timer exploits a very specific blind spot: our brains are excellent at reacting to deadlines and terrible at verifying them. A real deadline — a flight departing, a store that physically closes — demands speed, and our urgency in those moments is earned. Manufactured deadlines borrow that same urgency without any of the underlying reality. The trick is not that the deadline exists; it is that, in the moment, you cannot tell whether it does.'}
          </P>

          <H2>{isZh ? 'TikTok Shop 如何实现它' : 'How TikTok Shop implements it'}</H2>
          <P>
            {isZh
              ? '社交电商已经把稀缺性折叠进了购物闭环本身。三种机制尤为突出：'
              : 'Social commerce has folded scarcity into the shopping loop itself. Three mechanisms stand out:'}
          </P>
          <ul className="mb-6 space-y-3">
            <Li>
              <Strong>{isZh ? '限时秒杀。' : 'Flash sales.'}</Strong>
              {isZh
                ? '一件产品在一个有限的时间窗口内以"折扣"出售 —— 长到足以让你感到紧迫，短到足以打消你货比三家的念头。它不是要你去查别的价格，它是要你去点击。'
                : ' A product is offered at a “discount” for a limited window — long enough to feel urgent, short enough to discourage comparison shopping. You aren’t meant to check other prices. You’re meant to click.'}
            </Li>
            <Li>
              <Strong>{isZh ? '限时优惠。' : 'Limited-time offers.'}</Strong>
              {isZh
                ? '一个倒计时在一处被划掉的更高"原价"旁跳动。被划掉的价格是锚点，倒计时是施压。它们是同一条信息的两半：'
                : ' A timer counts down beside a price struck through from a higher “regular” price. The struck-through price is the anchor; the countdown is the pressure. They are two halves of one message: '}
              <em>{isZh ? '立刻行动，否则它就消失了。' : 'act now, or this disappears.'}</em>
            </Li>
            <Li>
              <Strong>{isZh ? '直播倒计时。' : 'Live-stream countdowns.'}</Strong>
              {isZh
                ? '主播把一个可见的倒计时与肉眼可见减少的库存搭配在一起 —— '
                : ' Hosts pair a visible countdown with visibly depleting stock — '}
              <em>{isZh ? '"此价格仅剩 20 件，手慢无。"' : '“only 20 left at this price, going fast.”'}</em>
              {isZh
                ? '由于直播是实时的，这种紧迫感显得无可辩驳。人群、弹幕、主播的煽动力：所有这些都是被精心营造的势能。'
                : " Because the stream is real-time, the urgency feels undeniable. The crowd, the chat, the host's energy: all of it is engineered momentum."}
            </Li>
          </ul>
          <P>
            {isZh
              ? '注意这些机制没有一件做的事：它们从不要求你去比较、去等待，或去反思。整套架构的设计目的，就是把'
              : 'Notice what none of these mechanisms does: it never asks you to compare, to wait, or to reflect. The whole architecture is designed to compress the time between '}
            <em>{isZh ? '想要' : 'want'}</em>
            {isZh ? '和' : ' and '}
            <em>{isZh ? '购买' : 'buy'}</em>
            {isZh ? '之间的时间压缩成一次心跳。' : ' into a single heartbeat.'}
          </P>
          <P>
            {isZh
              ? '共同的主线：每一种机制都把一次寻常的购物变成一场与时间的赛跑 —— 而时钟才是主角。'
              : 'The common thread: every mechanism turns an ordinary purchase into a race against the clock — and the clock is the star.'}
          </P>

          <H2>{isZh ? '背后的心理学' : 'The psychology underneath'}</H2>
          <P>
            {isZh
              ? 'FOMO 倒计时倚仗三种有充分记录的效应，每一种各司其职：'
              : 'The FOMO Timer leans on three well-documented effects, each one doing different work:'}
          </P>
          <ul className="mb-6 space-y-3">
            <Li>
              <Strong>{isZh ? '稀缺原则（西奥迪尼）。' : 'Scarcity principle (Cialdini).'}</Strong>
              {isZh
                ? '稀缺的物品会被感知为更有价值。"最后一件"不再是一件商品，而是一个罕见的机会。你不再是在买东西，而是在抢夺一份奖品。'
                : ' Items that are scarce are perceived as more valuable. A “last one” stops being a product and becomes a rare opportunity. You are no longer buying a thing; you are securing a prize.'}
            </Li>
            <Li>
              <Strong>{isZh ? '损失厌恶（卡尼曼与特沃斯基）。' : 'Loss aversion (Kahneman & Tversky).'}</Strong>
              {isZh
                ? '前景理论表明，损失带来的痛苦大约是等量收益带来快乐的两倍。倒计时把购物重新框定为避免损失 —— '
                : ' Prospect theory shows that losses hurt roughly twice as much as equivalent gains please us. A countdown reframes the purchase as avoiding a loss — '}
              <em>{isZh ? '"我会错过这个优惠"' : '“I’d miss this deal”'}</em>
              {isZh
                ? ' —— 而不是获得收益。我们拼命去防止一个我们其实从未真正拥有的损失。'
                : ' — rather than making a gain. We scramble to prevent a loss we never actually owned.'}
            </Li>
            <Li>
              <Strong>{isZh ? '时间压力效应。' : 'Time-pressure effect.'}</Strong>
              {isZh
                ? '在时间约束下，我们会从审慎决策转向直觉决策。我们不再权衡，而是开始反应。时钟不只是增加紧迫感；它关掉了大脑里那个说'
                : " Under time constraints, we shift from deliberative to intuitive decision-making. We stop weighing and start reacting. The clock doesn't just add urgency; it switches off the part of the brain that says "}
              <em>{isZh ? '"让我先想想。"' : '“let me think about this for a minute.”'}</em>
            </Li>
          </ul>
          <P>
            {isZh
              ? '三者共同构成一个循环：稀缺感抬高感知价值，倒计时把代价框定为损失，而时间压力扼杀了本可识破这两者的审慎。而信息流从不让压力松手 —— 你划走，下一条视频在你那股冲动还没来得及冷却之前就重启了循环。这就是为什么 FOMO 式购物感觉不像是一个决定，更像是一种反射：等这台机器对你完成加工时，已经没剩下多少决定可做了。'
              : 'Together they form a loop: scarcity raises the perceived value, the countdown frames the cost as a loss, and time pressure kills the deliberation that would have caught both. And the feed never lets the pressure go — scroll away and the next video restarts the loop before your arousal has time to cool. This is why FOMO shopping feels less like a decision and more like a reflex: by the time the machinery is finished with you, there isn’t much decision left to make.'}
          </P>

          <H2>{isZh ? '数字背后的机制' : 'The mechanism behind the numbers'}</H2>
          <P>
            {isZh
              ? '你不需要内部数据就能看清这台机器是怎么造的 —— 界面的行为已经告诉了你。社交平台上的限时秒杀通常由一个轮换的折扣名额池驱动：平台或商家决定以"优惠价"售出多少件、窗口开放多久，以及在它关闭后是否再开一个窗口。"原价"往往是为这次促销专门设定的参考锚点，好让折扣始终显得很深。当一个倒计时结束，几小时或几天后同一个产品又可以开启一个新的倒计时。'
              : "You don't need inside data to see how the machine is built — the behavior of the interface tells you. Flash sales on social platforms are usually driven by a rotating pool of discount slots: the platform or the merchant decides how many units move at the “deal” price, how long the window stays open, and whether to open another window when it closes. The “regular” price is often a reference anchor set for the sale itself, so the discount can always be shown as deep. When one countdown expires, a fresh one can begin for the same product a few hours or days later."}
          </P>
          <P>
            {isZh
              ? '结果是一个永不真正停止促销的信息流 —— 也就是说购物者永远没有真正走出"优惠模式"。从卖家的角度看，这是理性的：紧迫感能带来转化。从购物者的角度看，这意味着平台的默认状态就是被精心营造的压力。问题不在于倒计时是否诚实 —— 而在于你是否分辨得出。'
              : 'The result is a feed that never really stops being on sale — which means the shopper is never really out of “deal mode.” From the seller’s side, this is rational: urgency converts. From the shopper’s side, it means the default state of the platform is engineered pressure. The question is not whether the timer is honest — it is whether you can tell.'}
          </P>
          <P>
            {isZh
              ? '这些窗口的时长并非随意。平台和卖家像测试缩略图一样测试它们：更短的窗口转化更多首次冲动，更长的窗口则捕获那些更慢的审慎者 —— 而胜出的版本就成了你看到的默认设置。你的倒计时不是在报告世界的状态，而是在报告别人实验的结果。'
              : "The lengths of these windows are not arbitrary. Platforms and sellers test them the way they test thumbnails: shorter windows convert more first-time impulse, longer ones capture the slower deliberators — and the version that wins the test becomes the default you see. Your countdown is not reporting the state of the world; it is reporting the outcome of someone else's experiment."}
          </P>
          <BlockQuote>
            {isZh ? '一个你无法核实的倒计时不是信息，而是指令。' : "A timer you can't verify is not information. It is instruction."}
          </BlockQuote>

          <H2>{isZh ? '如何识破它：三个信号' : 'How to spot it: 3 signals'}</H2>
          <P>{isZh ? '下次一个倒计时抓住你时，做这三个检查。' : 'Next time a timer grabs you, run these three checks.'}</P>
          <div className="my-6 space-y-4">
            <SignalCard num="01" title={isZh ? '倒计时会重启吗？' : 'Does the countdown restart?'}>
              {isZh
                ? '刷新页面，或等它归零。如果同一个"优惠"带着一个新的倒计时回来了，那个截止时间就从未真实存在过。真正的清仓是有终点的。'
                : 'Refresh the page, or wait for it to hit zero. If the same “deal” returns with a fresh countdown, the deadline was never real. A genuine clearance has an ending.'}
            </SignalCard>
            <SignalCard num="02" title={isZh ? '库存会变吗？' : 'Does the stock change?'}>
              {isZh
                ? '记下那个"仅剩 3 件"的数字，然后刷新。如果它在 3、5、2、4 之间来回跳动，那个库存指示就是动画，而不是库存。真正的库存不会跟着你的刷新键来回震荡。'
                : "Note the “only 3 left” number, then refresh. If it swings from 3 to 5 to 2 to 4, the inventory indicator is animation, not inventory. Real stock doesn't oscillate with your refresh key."}
            </SignalCard>
            <SignalCard num="03" title={isZh ? '下周它还会在吗？' : 'Would it still be here next week?'}>
              {isZh
                ? '搜索产品名称，或几天后再回来看看。如果限时秒杀是每周一次的活动，那你抓住的并不是一个正在关闭的窗口 —— 你看的是一场重播。紧迫感只是布景。'
                : "Search the product name, or come back in a few days. If the flash sale is a weekly event, you're not catching a closing window — you're watching a repeat broadcast. The urgency is set-dressing."}
            </SignalCard>
          </div>
          <P>
            {isZh
              ? '一个诚恳的反对意见：有时候倒计时是真的。一个卖家确实可能把一批限量卖光。这正是这些检查重要的原因 —— 你不是在寻找倒计时是假的证据，你是在寻找它是真的证据。如果它会重启，如果库存乱跳，如果同一个"优惠"已经循环了好几个月，那么这份紧迫感就是表演，你可以安心地把拇指放下来。'
              : "One honest objection: sometimes the timer is real. A seller can genuinely run out of a limited batch. That is exactly why these checks matter — you aren't looking for proof the timer is fake. You're looking for evidence it's real. If it restarts, if the stock wanders, if the same “deal” has been on a loop for months, then the urgency is theater, and you can safely let your thumb come down."}
          </P>

          <H2>{isZh ? 'Symy 如何帮你' : 'How Symy helps'}</H2>
          <P>
            {isZh
              ? 'Symy 正是为这一刻而生 —— 拇指悬停、心跳加速、倒计时滴答作响。小象 Symy 会替你把好绿色关。它做三件事。'
              : "Symy is built for this exact moment — thumb hovering, heart racing, timer ticking. Symy the little elephant holds the green gate for you. It does three things."}
          </P>
          <div className="my-6 space-y-4 rounded-2xl glass-card p-6">
            <BuddyRow label={isZh ? '拦一道绿色关' : 'Guard the green gate'}>
              {isZh
                ? '倒计时滴答作响的那一刻，小象会弹出把关挑战，先停在门前看清楚再决定。守住的钱真实流进你的梦想基金。'
                : "At the moment the timer ticks down, the little elephant raises a guard challenge — pause at the gate, see clearly, then decide. The money you defend flows into your real dream fund."}
            </BuddyRow>
            <BuddyRow label={isZh ? '给绿色替代' : 'Offer green alternatives'}>
              {isZh
                ? '耐用替代一次性、可循环替代用完即弃、二手/租赁优先。最绿色的购买是不买。'
                : 'Durable instead of disposable, recyclable instead of single-use, and secondhand or rental first. The greenest purchase is no purchase.'}
            </BuddyRow>
            <BuddyRow label={isZh ? '守住的钱进梦想基金' : 'Defended money funds dreams'}>
              {isZh
                ? '它把价格换算成你生命的若干小时，问一句：这笔值几小时的你？守住的钱真实流进你的梦想基金。'
                : 'It converts the price into hours of your life and asks how many hours of you this is worth. The money you defend flows into your real dream fund.'}
            </BuddyRow>
          </div>

          <H2>{isZh ? '算法不是你的朋友' : 'The algorithm is not your friend'}</H2>
          <P>
            {isZh
              ? 'FOMO 倒计时不是 bug。它是产品的核心机制，被精心设计来把错失恐惧转化为收入。互联网上半场的算法是为煽动贪婪、愤怒与欲望而建的。理解这套机制，并不需要你在与它们的公平较量中获胜，而只需要你认出倒计时什么时候只是一个舞台道具。'
              : "The FOMO Timer isn't a bug. It is the product's core mechanic, engineered to convert the fear of missing out into revenue. The algorithms of the top half of the internet are built to excite greed, anger, and desire. Understanding the mechanism doesn't require winning a fair fight against them. It requires recognizing when the timer is a stage prop."}
          </P>
          <P>
            {isZh
              ? '你不必在脑力上胜过信息流。你只需要暂停得足够久，久到能想起它只是一个信息流。'
              : "You don't have to outthink the feed. You just have to pause long enough to remember it's a feed."}
          </P>
          <BlockQuote>
            {isZh
              ? '算法不是你的朋友。但你可以成为它的对手 —— 一次暂停接一次暂停。'
              : 'The algorithm is not your friend. But you can become its opponent — one pause at a time.'}
          </BlockQuote>
        </article>

        {/* Bottom CTA card */}
        <section className="mt-16 rounded-2xl glass-card p-8 text-center">
          <h2 className="text-2xl font-bold text-text-primary">{isZh ? '免费试用 Symy' : 'Try Symy free'}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-secondary">
            {isZh
              ? '不是记账应用，而是守护伙伴。意志力输给算法 —— 守护则不会。'
              : "Not a budgeting app. A guardian buddy. Willpower loses to algorithms — guardianship doesn't."}
          </p>
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href={`/${locale}`}
              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 px-8 py-3.5 font-semibold text-white transition-all hover:from-emerald-300 hover:to-teal-400 active:scale-[0.98] btn-shimmer"
            >
              {isZh ? '免费开始' : 'Get started free'}
            </Link>
            <Link
              href={`/${locale}/blog`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-text-tertiary transition-colors hover:text-text-primary"
            >
              {isZh ? '更多《算法解构》' : 'More from Algorithm Decode'}
              <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
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
