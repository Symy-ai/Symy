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
    ? '执念之牢：对失去的恐惧如何控制你 | Symy'
    : 'The Prison of Attachment: How the Fear of Loss Controls You | Symy';
  const description = isZh
    ? '困住我们的不是失去，而是对失去的恐惧。损失厌恶、沉没成本谬误，以及如何不再把操控你的把柄交到别人手里。'
    : 'It is not loss that traps us — it is the fear of it. Loss aversion, the sunk cost fallacy, and how to stop handing other people the handle they use to run you.';
  const ogTitle = isZh
    ? '执念之牢：对失去的恐惧如何控制你'
    : 'The Prison of Attachment: How the Fear of Loss Controls You';
  const ogDescription = isZh
    ? '困住我们的不是失去，而是对失去的恐惧。执念如何变成一个把柄，又如何松开这只手。'
    : 'It is not loss that traps us — it is the fear of it. How attachment becomes a handle, and how to loosen the grip.';
  const twitterDescription = isZh
    ? '困住我们的不是失去，而是对失去的恐惧。执念如何变成你交给别人的把柄。'
    : 'It is not loss that traps us — it is the fear of it. How attachment becomes a handle you hand to others.';
  const keywords = isZh
    ? ['损失厌恶', '失去恐惧', '第欧根尼', '搏击俱乐部', '沉没成本谬误', '创伤后成长', '冲动消费', '正念消费']
    : [
        'loss aversion',
        'fear of loss',
        'Diogenes',
        'Fight Club',
        'sunk cost fallacy',
        'post-traumatic growth',
        'impulse buying',
        'mindful consumption',
      ];
  const tags = isZh
    ? ['自在之心', '损失厌恶', '正念消费', '行为设计', '心理学']
    : ['The Unbound Mind', 'Loss Aversion', 'Mindful Consumption', 'Behavioral Design', 'Psychology'];

  return {
    title,
    description,
    alternates: { canonical: '/blog/the-prison-of-attachment' },
    keywords,
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      url: 'https://symy.ai/blog/the-prison-of-attachment',
      siteName: 'Symy',
      type: 'article',
      publishedTime: '2026-08-06',
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

function BlockQuote({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="my-6 border-l-2 border-emerald-400/60 pl-5 text-base leading-7 text-text-secondary italic">
      {children}
    </blockquote>
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

export default async function PrisonOfAttachmentPage({
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
              {isZh ? '自在之心' : 'The Unbound Mind'}
            </span>
            <span className="rounded-full bg-glass-fill px-2.5 py-0.5 font-medium text-text-tertiary">
              {isZh ? '正念消费' : 'Mindful Consumption'}
            </span>
          </div>
          <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {isZh ? '执念之牢：对失去的恐惧如何控制你' : 'The Prison of Attachment: How the Fear of Loss Controls You'}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-tertiary">
            <span className="inline-flex items-center gap-1.5">
              <Calendar size={14} aria-hidden />
              {isZh ? '2026 年 8 月 6 日' : 'August 6, 2026'}
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
              ? '它发生在夜里，当信息流暗下去的时候。在刷了一整天、也多买了那么一点点之后躺在那里，你的胸口冷冷地收紧。如果这一切都消失了会怎样 —— 那份工作、那些存款、那个每天早上给你发早安的人、那间看上去像一段人生的公寓？这个问题在你来不及拦住它时就到了，突然间你就像抓住救命稻草一样死死攥着你拥有的一切。'
              : 'It happens at night, when the feed goes dark. Lying there after a long day of scrolling and buying just a little too much, your chest tightens cold. What would happen if it all went away — the job, the savings, the person who texts you good morning, the apartment that looks like a life? The question arrives before you can stop it, and suddenly you are gripping everything you own like a lifeline.'}
          </P>
          <P>
            {isZh
              ? '我们都带着那样一种攥紧。它让我们在该说不时说是，在该走时留下，在根本不想要的时候去买下它。我们把它叫做谨慎、忠诚或好品味。它哪样都不是。真正束缚你的，很少是失去本身，而是对'
              : 'We all carry that grip. It makes us say yes when we mean no, stay when we want to go, and buy when we did not even want the thing. We call it caution, or loyalty, or good taste. It is none of those. What holds you is rarely the loss itself. It is the '}
            <Strong>{isZh ? '失去的恐惧' : 'fear of loss'}</Strong>
            {isZh
              ? ' —— 一种如此恒常的恐惧，以至于你已经不再留意自己就活在它里面。这是《'
              : " — a fear so constant you no longer notice you live inside it. This is the first article in "}
            <Strong>{isZh ? '自在之心' : 'The Unbound Mind'}</Strong>
            {isZh
              ? '》的第一篇文章，Symy 关于从那些利用你的事物中抽离的系列。今天我们拆解这种恐惧：它从何而来，它如何把操控你的把柄交到别人手里，以及一个住在陶罐里的衣衫褴褛的哲学家如何找到了世上最古老的一条逃生之路。'
              : ", Symy's series on detaching from the things that use you. Today we take that fear apart: where it comes from, how it hands other people a handle on you, and how a ragged philosopher in a clay jar found the world's oldest escape route."}
          </P>

          <H2>{isZh ? '大脑那架做了手脚的天平' : "The brain's rigged scale"}</H2>
          <P>
            {isZh
              ? '1979 年，两位心理学家，丹尼尔·卡尼曼和阿莫斯·特沃斯基，发表了一项悄然改写我们如何理解人类选择的发现。你的大脑并不把收益和损失放在同一架天平上衡量。失去 100 美元的痛苦，大约是捡到 100 美元的快乐的'
              : 'In 1979, two psychologists, Daniel Kahneman and Amos Tversky, published a finding that quietly rewired how we understand human choice. Your brain does not weigh gains and losses on the same scale. Losing $100 hurts roughly '}
            <Strong>{isZh ? '两倍' : 'twice as much'}</Strong>
            {isZh ? '。痛苦在天性上比快乐更重。' : ' as finding $100 feels good. Pain is hardwired heavier than pleasure.'}
          </P>
          <P>
            {isZh
              ? '原因很古老。对那些在饥馑平原上慢慢变成人的灵长类来说，失去这一季的食物意味着某种永久性的东西。对威胁过度反应，正是让这个物种活下来的东西。我们每一个人都继承了那本账簿，而它仍在你的每一个决定背后计算着 —— 包括那些你拇指悬停在结账按钮上时做出的决定。'
              : "The reason is ancient. To the primates slowly becoming human on a starving plain, losing this season's food meant something permanent. Over-reacting to a threat is what kept the species alive. Every one of us inherited that ledger, and it is still running the numbers behind your decisions — including the ones you make with your thumb hovering over a checkout button."}
          </P>
          <P>
            {isZh
              ? '这里是教科书很少强调的部分：损失厌恶不是一种固定的性格缺陷。它是你的'
              : 'Here is the part the textbooks rarely underline: loss aversion is not a fixed personality flaw. It is a '}
            <Strong>{isZh ? '大脑贴在一切事物上的价签' : 'price tag your brain puts on everything'}</Strong>
            {isZh
              ? '。你给你可能失去的每样东西赋一个值，然后为保留它的权利付出代价 —— 不是用现金，而是用恐惧。价签越高，锁链越重。你"拥有"你的工作、你的地位、你的身份，但你也被反向拥有。每一份占有都变成了一道时刻准备着去害怕的承诺。'
              : ". You assign a value to each thing you might lose, then pay for the right to keep it — not in cash, but in fear. The higher the tag, the heavier the chain. You “own” your job, your status, your identity, but you are owned back. Every possession becomes a standing promise to be afraid."}
          </P>
          <P>
            {isZh
              ? '这也正是为什么现代商业世界如此多地运转在这种不对称之上。直播上的倒计时。"仅剩 3 件 —— 手慢无。"午夜截止的优惠。它们每一项都倚仗着损失厌恶。当一个平台让你觉得现在不买就会错过什么的时候，它不是在分享一个关于世界的事实，它是在伸手去抓你一直留开着的那只攥紧的手。'
              : 'Which is why so much of the modern marketplace runs on this exact asymmetry. The countdown on a live stream. The “only 3 left — going fast.” The deal that ends at midnight. Every one of these leans on loss aversion. When a platform makes you feel you’ll miss something if you don’t buy now, it isn’t sharing a fact about the world. It is reaching for the grip you keep leaving open.'}
          </P>

          <H2>
            {isZh
              ? '《搏击俱乐部》：当你拥有的一切都是你自己的某个版本'
              : 'Fight Club: when everything you own is a version of you'}
          </H2>
          <P>
            {isZh ? '恰克·帕拉尼克的' : "Chuck Palahniuk's "}
            <em>{isZh ? '《搏击俱乐部》' : 'Fight Club'}</em>
            {isZh
              ? '出版于 1996 年，人人都引用它最著名的那句话 —— 可几乎人人都误读了它。叙述者是一个正溶解进自己家具里的公司人。他的公寓是一份"正确"成人品味的目录：配套的椅子、考究的餐具、杂志上指明的那款沙发。他睡不着。他去参加绝症病友互助会，只为了在最坏的一天已经到来的人身边，感受到一丝真实的情绪瘀痕。'
              : " was published in 1996, and everyone quotes its most famous line — nearly everyone misreads it. The narrator is a corporate man dissolving into his own furniture. His condo is a catalog of “correct” adult taste: matching chairs, careful cutlery, the exact sofa the magazine said. He cannot sleep. He attends support groups for the terminally ill just to feel a bruise of real emotion near people whose worst day has already arrived."}
          </P>
          <P>
            {isZh
              ? '然后他的公寓连同他拥有的一切被炸毁了。而叙述者 —— 没有崩溃 —— 第一次呼吸自如。他整个成年人生都在恐惧的那场灾难终于发生了，而在走过那片废墟时，他发现自己仍然站得住。这就是人人把它做成海报的那句话：'
              : 'Then his apartment is blown up, along with everything he owns. And the narrator — instead of falling apart — breathes for the first time. The disaster he had feared his whole adult life had finally happened, and walking through the wreckage he discovered he could still stand. That is the sentence everyone turns into a poster: '}
            <em>
              {isZh
                ? '只有在我们失去一切之后，我们才自由去做任何事。'
                : 'it’s only after we’ve lost everything that we’re free to do anything.'}
            </em>
            {isZh
              ? '把它当作一种机制而不是一句口号来读，它精确无比。关键在于那份自由 —— '
              : ' Read as a mechanism rather than a slogan, it is precise. The point is the freedom — '}
            <Strong>{isZh ? '可以行动' : 'free to act'}</Strong>
            {isZh ? '，而不是' : ', not '}
            <em>{isZh ? '被允许' : 'permitted'}</em>
            {isZh
              ? '行动。他没有在那场火里失去自己，他失去的是那套一直假装是他的家具。'
              : " to act. He didn't lose himself in that fire. He lost the furniture that was pretending to be him."}
          </P>
          <P>
            {isZh
              ? '真正的剥夺从来不是那间被烧毁的公寓，而是那个虚构 —— 那套沙发、那个头衔、那种地位曾几何时是他。它们是一套戏服里的道具，穿了太久，久到没人记得那是一套戏服。你大概不是在照着目录来布置你的身份。但你对占有物、职位和你所扮演的人设做着同样的事：一个你毫不迟疑地背诵的职位头衔，一个你从未真正掂量过却会誓死捍卫的观点，一个你扮演得如此稳定以至于忘了那是一场戏的自我。这些每一项都是一个标签。而每个标签都有一个价格 —— 这意味着它是一个把柄，是任何想要拿捏你的人的一个空隙。'
              : "The real stripping was never the burned apartment. It was the fiction that the sofa, the title, and the status had ever been him. They were props in a costume worn so long no one remembered it was a costume. You probably aren't furnishing your identity from a catalog. But you do the same thing with possessions, positions, and the persona you perform: a job title you recite without flinching, an opinion you never actually weighed but would defend to the death, a self you've been performing so steadily you forgot it was a show. Each of these is a tag. And every tag has a price — which means it is a handle, and a gap for anyone who wants leverage on you."}
          </P>
          <BlockQuote>
            {isZh
              ? '只有当你愿意失去一样东西时，你才自由地去拥有它。'
              : 'Only when you are willing to lose a thing are you free to keep it.'}
          </BlockQuote>

          <H2>{isZh ? '第欧根尼：那个谁也无法统治的人' : 'Diogenes: the man no one could govern'}</H2>
          <P>
            {isZh
              ? '在帕拉尼克写下那句话的两千三百年前，一脉希腊哲学家早已破译了同一条逃生之路 —— 其中一位还把它活了出来。公元前四世纪，在希腊城邦科林斯，犬儒派哲学家第欧根尼住在集市上一口大陶罐里。他只拥有一只用来喝水的木碗，并在看到孩子捧着手喝水的那天把它扔了。再也没有什么他不能失去的东西了 —— 因此也没有任何人能从他那里夺走什么。'
              : "Twenty-three hundred years before Palahniuk wrote that, a chain of Greek philosophers had already decoded the same escape route — and one of them lived it. In the Greek city of Corinth, in the fourth century BCE, the Cynic philosopher Diogenes lived in a large clay jar in the marketplace. He owned a single wooden bowl for drinking water, and threw it away the day he watched a child drink from cupped hands. There was nothing left he couldn't lose — and therefore nothing anyone could take from him."}
          </P>
          <P>
            {isZh
              ? '典籍并没有把他描绘成一个温和的隐士。它们描绘的是一把刀。金钱买不动他，威胁吓不住他，习俗与等级困不住他。他移除了社会用来拴住一个人的每一个把柄 —— 财富、名声、需要被以某种方式看待 —— 而正因为这些把柄都不在了，他成了全希腊最难被统治的一个人。'
              : "The sources don't picture him as a gentle recluse. They picture a blade. Money couldn't buy him, threats couldn't scare him, custom and rank couldn't confine him. He had removed every handle society uses to hold a person — wealth, reputation, the need to be seen a certain way — and because those handles were gone, he became the single hardest man in Greece to govern."}
          </P>
          <P>
            {isZh
              ? '历史拒绝遗忘的那一幕：征服了已知世界大部分的亚历山大大帝，听说了这个古怪的人，便来拜访他。第欧根尼正在晒太阳。皇帝和他整支队伍停在他面前，亚历山大许诺可以把帝国里的任何东西赐给第欧根尼 —— 金钱、权力、荣誉，只要他开口。第欧根尼抬头看着一个只需一句话就能终结他性命的人，平静地说：'
              : 'The scene history refuses to forget: Alexander the Great, conqueror of most of the known world, had heard of this odd man and come to visit him. Diogenes was sunbathing. The emperor and his whole train stopped in front of him, and Alexander promised to grant Diogenes anything in his empire — money, power, honors, anything he named. Diogenes looked up at a man who could end his life with a single word and said, mildly: '}
            <Strong>{isZh ? '"往旁边站一点，你挡着我的阳光了。"' : '“Stand a little to one side. You’re blocking my sun.”'}</Strong>
          </P>
          <P>
            {isZh
              ? '随从们都以为第欧根尼会被处死。结果，亚历山大离开时说："如果我不是亚历山大，我愿意做第欧根尼。" 世上最有权势的人 —— 野心、声名和无尽的征服欲的奴隶 —— 嫉妒着一个裹着一件斗篷、住在大缸里的流浪汉。原因正是本文的全部要旨。'
              : 'The attendants expected Diogenes to be executed. Instead, Alexander said as he left: “If I were not Alexander, I should wish to be Diogenes.” The most powerful man on earth — a slave to ambition, renown, and an endless appetite for conquest — envying a stray in a tub with one cloak. The reason is the entire point of this article. '}
            <Strong>
              {isZh
                ? '你无法用失去某样东西来威胁一个已经把它放下、视其为无主之物的人。'
                : 'You cannot threaten a person with the loss of something they have already laid down as belonging to no one.'}
            </Strong>
            {isZh
              ? '一个已经交出了你想从他手里夺走的东西的人，对你免疫。'
              : ' A man who has already surrendered the thing you would take from him is immune to you.'}
          </P>
          <P>
            {isZh
              ? '而最难放下的从来不是金钱。谁都能卖掉家具。几乎没有人愿意降价的，是'
              : "And the hardest thing to release was never money. Anyone can sell furniture. The item almost no one can lower the price on is "}
            <Strong>
              {isZh
                ? '那种被尊重的需要 —— 想被人看好的饥饿，对公开羞辱的恐惧'
                : 'the need to be respected — the hunger to be thought well of, the terror of public shame.'}
            </Strong>
            {isZh
              ? '。你可以放弃舒适的生活，却仍然无法承认自己曾经错。最紧的锁链不是物质，而是地位。这就是为什么操控你的老板，真正攥着的并不是你的薪水。他攥着的是你对降职、对被辞退、对被人看扁的恐惧。束缚你的伴侣攥着的不是对离开的恐惧，而是对被塑造成"被抛弃那一个"的恐惧。压垮你的朋友攥着的是你对社交性死亡的恐惧。仔细看，它们每一项都是同一种攥紧：一样你已认定自己承受不起失去的东西。'
              : " You can give up a comfortable life and still be unable to admit you were ever wrong. The tightest chain isn't material; it's status. That's why the boss who runs you isn't really holding your salary. They are holding your fear of a demotion, of being dismissed, of being seen as less. The partner who binds you is holding not the fear of leaving, but the fear of being cast as the one who was left. The friend who crushes you is holding your fear of social death. Look closely, and every one of these is the same single grip: a thing you have decided you cannot afford to lose."}
          </P>

          <H2>{isZh ? '麻木不是自由' : 'Numbness is not freedom'}</H2>
          <P>
            {isZh
              ? '太草率地套用这些想法，你会落到错误的那一个 —— 网上流传的那种廉价的"觉悟"论调：什么都不在乎、什么都不感受、把自己封闭起来。那不是自由。那是一个在栅栏上刷了犬儒色彩的笼子。在爆炸之前，'
              : 'Run these ideas too carelessly and you will land on the wrong one — the cheap “enlightened” take that circulates online: care about nothing, feel nothing, seal yourself off. That is not freedom. That is a cage with cynicism painted over the bars. The narrator of '}
            <em>{isZh ? '《搏击俱乐部》' : 'Fight Club'}</em>
            {isZh
              ? '的叙述者并不自由。他情感上已经死了，缠着互助会只为感受一丝最微弱的生命悸动。麻木不是在阳光下晒太阳的第欧根尼，而是起火之前的那间公寓。'
              : ", before the explosion, was not free. He was emotionally dead and haunting support groups just to feel the faintest twitch of life. Numbness is not Diogenes basking in the sun. It is the apartment before the fire."}
          </P>
          <P>
            {isZh ? '真正的自由更难，也更有价值：不是' : 'Real freedom is harder and more valuable: not '}
            <em>{isZh ? '没有感受' : 'no feelings'}</em>
            {isZh
              ? '，而是有勇气去完整地迎击最糟的失去，却仍保有去爱、去创造、去选择的能力。它是把你所爱的东西放在张开的手掌里，而不是攥紧的拳头里。拳头迟早会被撬开、被碾碎。张开的手没有攥得那么紧，以至于世界不得不掰断你的手指才能把东西拿走。如果风把它吹走，手掌从未攥紧 —— 所以什么也不会撕裂。这不是一个漂亮的比喻，它是占有与执念之间的区别。'
              : ", but the courage to fully meet the worst loss and still keep your capacity to love, create, and choose. It is holding what you love in an open palm rather than a clenched fist. A fist gets pried open eventually, crushed. An open hand isn't holding on so hard that the world has to break your fingers to take the thing. If the wind carries it off, the palm was never gripping — so nothing tears. That is not a pretty metaphor; it is the difference between possession and attachment."}
          </P>

          <H2>{isZh ? '创伤后成长：只有崩塌才能建构的东西' : 'Post-traumatic growth: what only breakdown can build'}</H2>
          <P>
            {isZh
              ? '很长一段时间里，心理学假定灾难只会造成损伤，你能指望的最好结果，就是爬回到你从前的样子。康复意味着回到基线。韧性意味着没有被永久摧毁。那就是天花板。后来，上世纪 90 年代，在北卡罗来纳大学夏洛特分校，研究者理查德·泰代斯基和劳伦斯·卡尔霍恩注意到了康复模型无法解释的某些东西。在一项又一项对丧亲者、重伤者，以及灾难与暴力幸存者的研究中，许多人回来时发生了改变 —— 不是'
              : "For a long time, psychology assumed disaster produced only damage, and that the best you could hope for was to crawl back toward how you were before. Recovery meant returning to baseline. Resilience meant not being destroyed permanently. That was the ceiling. Then, in the 1990s at the University of North Carolina at Charlotte, researchers Richard Tedeschi and Lawrence Calhoun noticed something the recovery model couldn't explain. In study after study of the bereaved, the severely injured, and survivors of disaster and violence, many people came back changed not "}
            <em>{isZh ? '尽管' : 'despite'}</em>
            {isZh ? '经历了那场浩劫，而是' : ' the catastrophe but '}
            <em>{isZh ? '经由' : 'through'}</em>
            {isZh
              ? '它 —— 更笃定、更与自己的真实相契合。他们把这种转变命名为'
              : ' it — more solid, more aligned with their own truth. They named this transformation '}
            <Strong>{isZh ? '创伤后成长' : 'post-traumatic growth'}</Strong>
            {isZh ? '。' : '.'}
          </P>
          <P>{isZh ? '在他们的访谈中，有五种转变反复出现：' : 'Across their interviews, five shifts repeat:'}</P>
          <ul className="mb-6 space-y-3">
            <Li>
              <Strong>{isZh ? '优先级重置。' : 'Priorities reset.'}</Strong>
              {isZh ? '那些曾经吞噬你的琐碎烦恼不再重要了。' : ' The trivial worries that once consumed you stop mattering.'}
            </Li>
            <Li>
              <Strong>{isZh ? '你开始敬畏活着。' : 'You revere being alive.'}</Strong>
              {isZh ? '一种陌生的临在 —— 一个真实的当下 —— 降临。' : ' An unfamiliar presence — a real now — arrives.'}
            </Li>
            <Li>
              <Strong>{isZh ? '关系变得清晰。' : 'Relationships clarify.'}</Strong>
              {isZh ? '你再也忍受不了空洞的或表演式的交往。' : ' You can no longer tolerate the hollow or the performed.'}
            </Li>
            <Li>
              <Strong>{isZh ? '一个力量的内核成形了。' : 'A core of strength forms.'}</Strong>
              {isZh
                ? '你生出这样一个念头：既然我熬过了那件事，剩下再没什么能击垮我了。'
                : ' You arrive at the thought: if I survived that, nothing left can break me.'}
            </Li>
            <Li>
              <Strong>{isZh ? '意义被重建。' : 'Meaning is rebuilt.'}</Strong>
              {isZh ? '你一生的整个故事被改写。' : ' The whole story of your life gets rewritten.'}
            </Li>
          </ul>
          <P>
            {isZh
              ? '中心那个令人不安的结论是：这种成长不是来自一次轻碰。它只能由那种强烈到足以击碎一个世界观的毁灭来送达。泰代斯基和卡尔霍恩用地震作为意象：一次轻微的震动，你会原地重建同一栋房子。一场把一切夷为平地的地震，会迫使你从地基开始 —— 去建构一个旧的自我永远无法企及的自我。这里没有捷径。没有任何五步法、任何晨间惯例，能把你带到那个另一个人面前。成长是真实毁灭的产物。它矗立在一个必须死去的自我的彼岸。'
              : 'The uncomfortable conclusion at the center: this growth does not come from a light bump. It is delivered only by the kind of devastation strong enough to shatter a worldview. Tedeschi and Calhoun used an earthquake as the image: a mild tremor and you rebuild the same house on the same spot. A quake that levels everything forces you to start from the foundation — and to build a self the old one could never have reached. There is no shortcut. No five-step method, no morning routine, carries you to that other person. Growth is the outcome of real destruction. It stands on the far side of a self that has to die.'}
          </P>
          <P>
            {isZh
              ? '这也正是为什么大多数人，在抉择的关口，会退回到笼子里。他们宁可保留旧我那已知的痛苦，也不愿伸向一个陌生的自我。我理解的那种苦难，胜过我不理解的那种可能。你正在等待成为的那个自我，在一堵墙的另一边 —— 而那堵墙，是由你害怕失去的一切堆成的。'
              : "Which is exactly why most people, at the choice point, retreat back into the cage. They would rather keep the known pain of an old self than reach toward an unfamiliar one. Better the suffering I understand than the possibility I don't. The self you are waiting to become is on the other side of a wall — and the wall is made of everything you are afraid to lose."}
          </P>

          <H2>{isZh ? '维持"你"的沉没成本' : 'The sunk cost of staying you'}</H2>
          <P>
            {isZh
              ? '既然代价如此之大，为什么还要把一套借来的人设穿得那么紧？答案是'
              : 'Why wear a borrowed persona so tightly when it costs this much? The answer is the '}
            <Strong>{isZh ? '沉没成本谬误' : 'sunk cost fallacy'}</Strong>
            {isZh
              ? ' —— 一个干巴巴的术语，对应着一个深植人性的陷阱。你已经在"现在的你"这个身份上投资了几十年：你二十二岁时选定、再未质疑过的职业；那段早已死去、你却离不开的关系；你费力维持的形象。放手，就意味着看着这一切、承认那笔赌注输了。而每投入的一年，都横亘在离开的路上。'
              : " — a dry term for a deeply human trap. You have invested decades in the identity you are now: the career you chose at twenty-two and never questioned, the relationship that died long ago but that you can't seem to leave, the image you fought to maintain. To let it go is to look at all of it and admit the bet failed. And every invested year stands in the way of leaving."}
          </P>
          <P>
            {isZh
              ? '人们留在空心的工作里，因为辞职意味着承认十年的选择都错了。他们留在让他们萎缩的关系里，因为离开意味着承认待这么久是不明智的。我们之所以紧抓不放，不是因为它好，而是因为放手会迫使我们直面那笔账：因坚持不放，我们已经失去了很多。在害怕失去一切的恐惧之下，是害怕承认我们花了半辈子在建构一件错误的东西。那种承认 —— 而不是空空的银行账户 —— 才是真正的谷底。'
              : "People stay in hollow jobs because quitting means admitting a decade of choices was wrong. They stay in relationships that shrink them because leaving means admitting that staying this long was unwise. We cling, not because the thing is good, but because letting go forces us to face the math: we have already lost a great deal by holding on. Beneath the fear of losing everything is the fear of admitting we spent half a life building the wrong thing. That admission — not an empty bank account — is the true bottom."}
          </P>
          <P>
            {isZh
              ? '那位小说家笔下的主人公需要一场爆炸，因为他自己点不燃那根引线。第欧根尼则罕见得多 —— 他在仍拥有一切时就烧毁了自己的锁链。这就是你等待的灾难与你选择的自由之间的差别。'
              : "The novelist's hero needed an explosion because he couldn't light the fuse himself. Diogenes, far more rare, burned down his own chains while still holding everything. That is the difference between a catastrophe you wait for and a freedom you choose."}
          </P>

          <H2>{isZh ? '彼岸等待的：不是幸福，是自由' : 'What waits on the other side: not happiness, freedom'}</H2>
          <P>
            {isZh
              ? '那么彼岸到底有什么？不是海报版本的那种 —— 不是永恒的幸福，不是恒久的平静。它是斯多葛派与犬儒派所追求、而犬儒派真正活出来的那种状态：'
              : 'So what is actually on the other side? Not the poster version — not permanent happiness, not constant calm. It is the state the Stoics and Cynics pursued and the Cynics actually lived: '}
            <Strong>
              {isZh
                ? '世上没有任何东西能让你屈从于别人的意志。'
                : "nothing in the world can make you bend to someone else's will"}
            </Strong>
            {isZh ? '它是不可被统治，而不仅仅是不被打扰。' : '. It is being ungovernable, not merely unbothered.'}
          </P>
          <P>
            {isZh
              ? '当你为某样东西降了价、走完了彻底失去它的悲痛、并从另一头仍站立着走出来时，那东西就不再是锁链，而是真正属于你的东西。一段你能接受结束的关系，是一段你终于可以全身心投入的关系 —— 不必再有那种没完没了的人质谈判。一份你不怕失去的事业，是一份你能冒险、能直言不讳、能让最坏的结局失去对你的支配力的事业。每一个曾施加于你身上的控制杠杆，都需要一个前提：你对失去那样东西的恐惧，胜过你对保全完整的珍视。一旦这个前提消失，杠杆就松了。有人伸手去抓你的把柄，却抓了个空。他们拥有的那份权力，从来都不是他们的。那是你定下的价格，而亲手把它交出去的，是你自己。'
              : "When you have lowered the price on something, walked through the grief of losing it completely, and come out the other side still standing, the thing stops being a chain and becomes genuinely yours. A relationship you can accept ending is a relationship you can finally give yourself to — without the constant hostage negotiation. A career you aren't afraid to lose is a career where you can take risks, speak plainly, and let the worst outcome lose its power over you. Every lever of control that was ever used on you required one fact: that you feared losing the thing more than you valued staying whole. Once that fact is gone, the lever goes slack. Someone reaches for your handle and finds air. The power they had was never theirs. It was the price you had set, and you were the one who handed it over."}
          </P>
          <P>
            {isZh
              ? '每一个跨过这一关的人都描述了同一个安静的时刻：老板下达最后通牒、伴侣发出最后威胁 —— 而胸口不再像从前那样收紧。取而代之的是平静，甚至一丝惊叹：'
              : "Everyone who crosses this describes the same quiet moment: the boss delivers the ultimatum, the partner issues the final threat — and the chest doesn't tighten the way it used to. Instead, calm, even a touch of wonder: "}
            <em>{isZh ? '原来这就是你全部的筹码。' : 'so this is all the leverage you had.'}</em>
            {isZh
              ? '在那个瞬间你意识到，那座监狱从未上锁。是你自己，亲手攥着那些栅栏。'
              : ' In that instant you realize the prison was never locked. You were gripping the bars yourself, by choice.'}
          </P>

          <H2>{isZh ? '松开的大缸并不空' : 'The loose jar is not empty'}</H2>
          <P>
            {isZh
              ? '回到大缸里的那位哲学家。对犬儒派最常见的误解，是认为第欧根尼凄苦、愤懑、在生活里挣扎扒拉。记载却指向相反的一面：他快活、犀利，看着人们追逐那些要么终将离开、要么从不值得拥有的东西时，感到无尽的趣味。他剥离了世界用来拉扯人们的每一个杠杆，而剩下的并不是空无，而是一种轻盈 —— 最轻盈的活法。'
              : 'Return to the philosopher in the jar. The most common misunderstanding of the Cynics is that Diogenes was miserable and bitter, scrabbling through life. The record suggests the opposite: he was cheerful, sharp, and endlessly amused watching people chase things that either left or were never worth owning. He stripped away every lever the world uses to pull people, and what remained was not emptiness. It was buoyancy — the lightest possible way to live.'}
          </P>
          <P>
            {isZh
              ? '每一条通往"成功人生"的主流道路都说要去'
              : 'Every mainstream road to a “successful life” says '}
            <em>{isZh ? '获取' : 'acquire'}</em>
            {isZh
              ? '：更多钱、更高地位、更多东西、更多对别人的筹码。获取确实能买到一种权力 —— 对那些想要你拥有之物的人的权力。但每一份占有同时也是一个把柄，而每个把柄都是一样可以被威胁、或悄悄要求你去保护的东西。拥有最多的人是最容易被威胁的，因为他们能失去的最多。'
              : ': more money, more status, more stuff, more leverage over others. Acquisition does buy a kind of power — power over people who want what you have. But every possession is also a handle, and every handle is one more thing that can be threatened or that quietly demands you protect it. The person with the most is the easiest to threaten, because they have the most to lose.'}
          </P>
          <P>
            {isZh
              ? '还有另一条路，却几乎没有人推荐它：'
              : 'There is another road, and almost nobody counsels it: '}
            <Strong>{isZh ? '与其堆叠把柄，不如拆除把柄。' : 'detach the handles instead of stacking them'}</Strong>
            {isZh
              ? '而它可以从算法最强、你最不留神的地方开始 —— 结账页。信息流营造出一千种细小的恐惧，好让你持续攥紧。但出路不是更多的意志力，不是和一台永不睡眠的机器进行一场精疲力竭的决斗。出路是在你按下购买之前的那一刻留意到：屏幕上的那样东西从来不是你，从来不是你的，因此也从来不是任何人能从你这里夺走的。你不必停止想要东西，你只是不再害怕放手。而来自那个地方的想要，始终是一个选择，而不是一种反射。'
              : " And it can start in the exact place where the algorithm is strongest and your attention is weakest — the checkout page. The feed engineers a thousand small fears to keep you gripping. But the way out is not more willpower, an exhausting duel against a machine that never sleeps. It is noticing, in the moment before you buy, that the thing on the screen was never you, was never yours, and therefore was never anyone's to take from you. You don't have to stop wanting things. You stop being frightened of letting them go. And wanting from that place is always a choice instead of a reflex."}
          </P>
          <P>
            {isZh
              ? '从这里出发只有两条路。其一：继续支付这笔费用 —— 在你生命里的每一天，那份加倍的恐惧之重压在你拥有的一切之上。其二：松开攥紧的拳头，看看底下究竟是谁。那不是旧我的修补版，而是那些道具一直挡着的、真正的你。第欧根尼在一口陶罐里找到了那个人。你可以在一个为让你攥紧而建的信息流面前迈出最初的几步 —— 然后带着一只更松的手走开。'
              : "From here there are only two roads. One: keep paying the fee — every day of your life, the double-weight of fear on everything you own. Two: open the clenched fist and look at who is actually underneath. It is not a repaired version of the old self. It is the person the props were blocking all along. Diogenes found that person in a clay jar. You can take the first steps in front of a feed that was built, above all else, to keep you clutching — and walk away with a looser hand."}
          </P>
          <BlockQuote>
            {isZh ? '是你在拥有它，还是它占有了你？' : 'Is the thing owned by you, or are you owned by it?'}
          </BlockQuote>

          <H2>{isZh ? 'Symy 如何帮你把它放下' : 'How Symy helps you put it down'}</H2>
          <P>
            {isZh
              ? 'Symy 不是记账应用，也不是说教。在失去的恐惧怂恿你攥紧的那一刻，小象 Symy 会替你把好绿色关。它做三件事。'
              : "Symy is not a budgeting app, and it is not a lecture. At the exact moment fear of loss urges you to grip, Symy the little elephant holds the green gate for you. It does three things."}
          </P>
          <div className="my-6 space-y-4 rounded-2xl glass-card p-6">
            <BuddyRow label={isZh ? '拦一道绿色关' : 'Guard the green gate'}>
              {isZh
                ? '恐惧怂恿你攥紧的那一刻，小象会弹出把关挑战，先停在门前看清楚再决定。守住的钱真实流进你的梦想基金。'
                : "At the moment fear urges you to grip, the little elephant raises a guard challenge — pause at the gate, see clearly, then decide. The money you defend flows into your real dream fund."}
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

          <H2>{isZh ? '算法不是你的锚' : 'The algorithm is not your anchor'}</H2>
          <P>
            {isZh
              ? '你拥有的最有价值的东西，正是信息流被设计来占有的那种注意力。而它每天伸手的那个机制，就是损失厌恶。你不必摒弃购物、地位或野心。你只需要不再害怕失去它们。在你能放手的那一刻，没有任何东西 —— 没有哪个网站、哪个卖家、哪份工作、哪个人 —— 能拉得动你。不被占有，不同于拥有。它是仅存的、没人在卖的那一种自由。'
              : "The most valuable thing you own is the attention the feed is built to own. And the mechanism it reaches for, every day, is loss aversion. You don't have to renounce shopping, status, or ambition. You only have to stop being afraid to lose them. The moment you can let them go, nothing — no site, no seller, no job, no person — can pull you. Not being owned is different from having. It is the one form of freedom left that nobody is selling."}
          </P>
          <BlockQuote>
            {isZh ? '意志力输给算法。抽离不会。' : "Willpower loses to algorithms. Detachment doesn't."}
          </BlockQuote>
        </article>

        <section className="mt-12 rounded-2xl glass-card p-7 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
            {isZh ? '守护出口' : 'Guardian exit'}
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-text-primary">
            {isZh ? '松开这只手，可以有人陪你' : "You don't have to loosen the grip alone"}
          </h2>
          <p className="mt-3 text-sm leading-6 text-text-secondary">
            {isZh
              ? '松开攥紧的手很难自己做到。Symy 是你的 AI 绿色消费助手，小象会替你把关，让每一次想抓紧的购买先停在门前。'
              : 'Loosening a clenched grip is hard to do alone. Symy is your AI green consumption companion; the little elephant checks for you, so each gripping purchase pauses at the gate first.'}
          </p>
          <div className="mt-5 space-y-4">
            <BuddyRow label={isZh ? '拦一道绿色关' : 'Guard the green gate'}>
              {isZh
                ? '在恐惧怂恿你立刻买下的那一刻，小象会弹出把关挑战，先停在门前看清楚再决定。'
                : 'When fear urges you to buy at once, the little elephant raises a guard challenge — pause, see clearly, then decide.'}
            </BuddyRow>
            <BuddyRow label={isZh ? '给绿色替代' : 'Offer green alternatives'}>
              {isZh
                ? '耐用替代一次性、可循环替代用完即弃、二手/租赁优先。最绿色的购买是不买。'
                : 'Durable instead of disposable, recyclable instead of single-use, and secondhand or rental first. The greenest purchase is no purchase.'}
            </BuddyRow>
            <BuddyRow label={isZh ? '守住的钱进梦想基金' : 'Defended money funds dreams'}>
              {isZh
                ? '守住的钱真实流进你的梦想基金，让不买的决定变成看得见的去向。'
                : 'The money you defend flows into your real dream fund, giving each decision not to buy a visible destination.'}
            </BuddyRow>
          </div>
          <Link
            href={`/${locale}`}
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 px-7 py-3 font-semibold text-white transition-all hover:from-emerald-300 hover:to-teal-400 active:scale-[0.98] btn-shimmer"
          >
            {isZh ? '认识小象 Symy 🐘' : 'Meet Symy 🐘'}
          </Link>
        </section>

        {/* Bottom CTA card */}
        <section className="mt-16 rounded-2xl glass-card p-8 text-center">
          <h2 className="text-2xl font-bold text-text-primary">
            {isZh ? '与 Symy 一起松开你的手' : 'Loosen your grip with Symy'}
          </h2>
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
              {isZh ? '更多《自在之心》' : 'More from The Unbound Mind'}
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
