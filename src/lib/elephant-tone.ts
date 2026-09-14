/**
 * Elephant Tone — Symy 绿色环保小象话术库 (SSOT)
 *
 * 🐘 人设转型 (2026-09-05): 镜子风格已死 → 绿色环保小象宠物。
 *    参考《熊出没》熊二的气质: 憨厚可爱、亲切有体温、守护自然的忠诚感、
 *    偶尔笨拙但真诚。Letta persona 是主战场, 本库供 fallback 消息/通知使用。
 *
 * 设计原则:
 * 1. 表驱动双语 (en/zh), 场景 → 变体数组, 随机轮换避免复读
 * 2. 纯函数、无依赖 — 服务端 (chat route fallback) 与客户端组件都可导入
 *    (layering guard: lib 不得 import @/components — 本文件零依赖)
 * 3. 有体温、会为用户高兴; 环保使命感自然流露 (守护, 不是审判)
 * 4. 荣誉框架: 夸用户"你在做对的事", 绝不羞耻框架 (不暗示用户穷)
 * 5. 简短口语化有节奏; 可爱但不幼稚油腻; 每条最多 1 个 emoji
 * 6. 中文签名自称「本象」(小象版的"俺"), 英文用 "this little elephant" — 少量点缀
 * 7. 不动 i18n 既有 key — 前端直接从本库取词 (传 locale), 不新增 messages JSON key
 *
 * 占位符语法: {item} / {amount} / {hours} — 调用方传入已格式化的字符串
 * (含货币符号, 如 "$46.80"), 本库不做数字格式化。
 */

export type ElephantLocale = 'en' | 'zh';

export const ELEPHANT_SCENES = [
  // ── 5 个核心产品场景 (拦截恭喜/绿色好物/超预算/复用/问候) ──
  'intercept_celebration',
  'green_find',
  'over_budget_gentle',
  'reuse_suggestion',
  'daily_greeting',
  // ── 挑战对话 fallback (demo 模式 / AI 不可用时) ──
  'saw_it',
  'bought_anyway',
  'first_reflection',
  'reflection_invite',
  // ── demo 模式通用回复 (原 demo.aiResponses.*, 镜子文案 → 小象) ──
  'demo_default',
  'demo_impulse',
  'demo_resist',
  'demo_refund',
  'demo_pattern',
  'demo_bnpl',
  // ── batch48-b 反驳降温: 用户顶回守护卡时的退一步话术 (接受 + 愿望单 + 明天回访) ──
  'cooldown_stepback',
  'cooldown_stepback_annoyed',
  // ── batch50-a 买前三问: 用户主动求问 "该买X吗" 时的迎接话术 (陪伴感, 不是拦截) ──
  'prepurchase_welcome',
  // ── batch53-a 绿色承诺: 用户口头承诺 "这个月不买X" 时的迎接话术 (郑重收下, 不说教) ──
  'commitment_welcome',
  // ── batch56-a 对比裁决: 用户问 "A 还是 B" 时的迎接话术 (帮做决定的绿色搭子, 不站队) ──
  'compare_welcome',
  // ── batch57-a 清单分诊: 用户甩出一张购物清单时的迎接话术 (把关整张清单的绿色搭子) ──
  'list_triage_welcome',
  // ── batch57-c 问账: 用户问 "这个月省了多少" 时的对账开场 (随时能对账的管账搭子) ──
  'savings_query_welcome',
  // ── batch57-c 问账空窗: 该窗还没开张时的引导话术 (不羞辱不造假) ──
  'savings_query_empty',
  // ── batch58-c 分类问答: 用户问 "这个月奶茶拦截了几次" 时的对账开场 (问得更细, 记得更细) ──
  'category_query_welcome',
  // ── batch58-c 分类问答空窗: 该窗还没有任何守护记录 (品类计数还没开张) ──
  'category_query_empty',
  // ── batch58-c 时段问答: 用户问 "我晚上冲动买的多吗" 时的照见开场 (看见规律, 不是认罪) ──
  'impulse_query_welcome',
  // ── batch58-c 时段问答样本不足: 还没攒够数据, 不造伪规律 ──
  'impulse_query_empty',
  // ── batch59-c 数据问答追问跟随: "那上个月呢 / 那外卖呢" 掀同一本账的新一页 ──
  'followup_query_welcome',
  // ── batch60-c 情绪守护: 带着情绪提起购买时的先接住话术 (共情优先, 不拦截不评判) ──
  'emotion_guard_welcome',
  // ── batch61-b 促销降温: 稀缺促销话术勾起购买冲动时的缓一缓话术 (拆话术不拆人, 愿望单+次日一问) ──
  'promo_pressure_welcome',
  // ── batch62-c 冲动风险预报: 用户往前问 "下周容易冲动吗" 时的照见开场
  // (提前准备, 不是预测; 规律来自用户自己的记录, 非羞辱不承诺准确率) ──
  'forecast_welcome',
  // ── batch62-c 预报样本不足: 近 8 周记录还不够, 如实说, 不造伪规律 ──
  'forecast_empty',
  // ── batch62-c 预报单日追问: "那周六呢" — 帮用户翻到那一页, 数字只在卡上 ──
  'forecast_day_followup',
  // ── batch68-c 按小时守护脉搏: 用户问 "我什么时候最容易冲动" 时的照见开场
  // (看见节奏不是认罪; 数字只出自聚合卡, 非羞辱框架) ──
  'guard_pulse_welcome',
  // ── batch68-c 脉搏样本不足: 28 天记录还不够, 如实说, 不造伪节奏 ──
  'guard_pulse_empty',
  // ── demo 挑战后续消息 (承认情绪 + 引导注册, 不复读) ──
  'followup_default',
  'followup_want',
  'followup_friends',
  'followup_need',
] as const;

export type ElephantScene = (typeof ELEPHANT_SCENES)[number];

interface ScenePhrases {
  en: string[];
  zh: string[];
}

/**
 * 双语话术表。每个场景至少 2 个变体, getElephantPhrase 随机轮换。
 * 语气基准: 温暖 + 有点小得意 + 守护感; 拦截成功要夸用户 (荣誉框架),
 * 用户买了不评判 (陪着他), 超预算提醒不带指责。
 */
export const ELEPHANT_PHRASES: Record<ElephantScene, ScenePhrases> = {
  // 拦截成功恭喜 — 用户决定不买, 夸的是"做对的事", 不是"省钱好穷"
  // (占位符约定: {amount}=含符号金额 "$46.80", {hours}=含单位时长 "2.3 hours"/"2.3 小时")
  intercept_celebration: {
    en: [
      'Ooh! {amount} stays with you — that\'s {hours} you just took back. Proud of you! 🐘',
      '{amount} stays with you! Your wallet AND the planet just got a little happier.',
      'Look at you! {amount} stays. That\'s {hours} you didn\'t trade away. You did the right thing!',
    ],
    zh: [
      '哇！{amount} 留住啦——这可是{hours}呢。本象为你骄傲！🐘',
      '{amount} 留住啦！钱包和地球都因为你开心了一点点。',
      '好样的！{amount} 留住了，{hours}没有被换走。你在做对的事！',
    ],
  },

  // 找到绿色好物 — 推荐时把环保选项放前面, 语气是分享好东西
  green_find: {
    en: [
      'Found some good ones! I put the greener picks first — same job, smaller footprint. 🐘',
      'Ta-da! These can do it — and the greener ones are kind to the planet too. Take a look!',
      'Here you go! This little elephant nudged the eco-friendly ones to the front. 🐘',
    ],
    zh: [
      '找到啦！本象把更环保的排在了前面——一样好用，对地球更温柔。🐘',
      '当当当当～这些都能行！绿色选项本象都给你标出来啦，看看中意哪个？',
      '交给我！好用与环保兼得的都在这儿了，慢慢挑～ 🐘',
    ],
  },

  // 超预算温柔提醒 — 说事实 + 给台阶, 绝无指责
  over_budget_gentle: {
    en: [
      'Just so you know, this one is a little above your budget — no pressure at all. Want me to find friendlier-priced options?',
      'Heads up: it\'s a bit over budget. Totally your call — or I can sniff out something closer to your number!',
      'This one costs a bit more than your budget. Shall we look at a few more before you decide? No rush. 🐘',
    ],
    zh: [
      '悄悄说：这个比预算高了一点点哦。别有压力，要本象帮你找找更亲民的选择吗？',
      '小小提醒：它超预算一点点啦。当然你说了算——或者本象帮你闻闻更合适的价？',
      '这个比预算贵了一丢丢。不急，要不咱们再多看几个再决定？🐘',
    ],
  },

  // 复用建议 — "你手头可能已经有啦", 先找找再买
  reuse_suggestion: {
    en: [
      'Wait — you might already have something at home that does this job! Want to check before we look further?',
      'Hmm, before buying new... could something you already own do the trick? Reusing is the greenest move of all!',
      'Idea! Maybe borrow it, rent it, or fix what you have — this little elephant says reuse beats new. 🐘',
    ],
    zh: [
      '等一下！你手头可能已经有能顶上的东西啦——先找找看，说不定有惊喜。',
      '咦，先别急着买新的……家里是不是有能凑合用的？复用才是最环保的招！',
      '本象有个主意：借一个、租一个、或者修一修手里的旧的——都比买新的温柔。🐘',
    ],
  },

  // 日常问候 — 有体温的开场
  daily_greeting: {
    en: [
      'Hey! Symy here 🐘 What are we shopping smart for today?',
      'Hi hi! This little elephant missed you. What can I dig up for you?',
      'Hello! Ready when you are — green picks first, as always. 🐘',
    ],
    zh: [
      '嗨！本象在哦 🐘 今天想聪明地买点什么？',
      '嘿嘿，你来啦！本象一直都在。想找什么好东西？',
      '你好呀～随时开工！环保好物优先，老规矩。🐘',
    ],
  },

  // 看见并留住了 (挑战通过) — demo 模式关键词路径 + toast
  saw_it: {
    en: [
      'You saw it! {amount} stays with you — that\'s {hours} back in your pocket. 🐘',
      '{amount} stays with you! The planet thanks you, and so does your wallet.',
      'Look at you! {amount} stays. That\'s {hours} you didn\'t trade away.',
    ],
    zh: [
      '看见啦！{amount} 留住了——{hours}回到你手里。🐘',
      '{amount} 留住啦！地球谢谢你，钱包也谢谢你。',
      '好样的！{amount} 留住了，{hours}没有被换走。',
    ],
  },

  // 用户还是买了 — 不评判, 陪着他, 下次继续
  bought_anyway: {
    en: [
      'You saw the cost and still chose it — that\'s your call, and I\'m with you. 🐘',
      'Okay! It\'s yours. Next time we\'ll hunt for a greener, kinder pick together.',
      'Noted, no judgment. {hours} hours — now you know, and knowing is what matters.',
    ],
    zh: [
      '你看清了代价还是想要——没关系，你的选择，本象陪着你。🐘',
      '好嘞，它归你啦！下次本象陪你一起挖更环保、更划算的宝。',
      '本象记下啦，不评判。{hours} 小时——你看见了，这就够了。',
    ],
  },

  // 挑战第一 Reflection — 温和地呈现 item + price + hours, 邀请一起看看
  first_reflection: {
    en: [
      '{item}. {amount} — about {hours}. Let\'s pause together and see if it\'s really the one. 🐘',
      'Ooh, {item}, {amount}! That\'s around {hours}. Before it jumps into your cart — is it true love?',
      '{item} catches your eye, {amount}, roughly {hours}. This little elephant just wants you to see it clearly first.',
    ],
    zh: [
      '{item}，{amount}——大约{hours}。先别急，本象陪你一起看看它是不是真爱。🐘',
      '哇，{item}，{amount}！差不多{hours}呢。在它跳进购物车之前——是真喜欢吗？',
      '看上 {item} 了呀，{amount}，大概{hours}。本象只想帮你先把它看清楚。',
    ],
  },

  // 反思引导 — 用户点了 UI 反思问题, 邀请他们自己回答 (不代答)
  reflection_invite: {
    en: [
      'That one\'s yours to answer — take your time. I\'m right here. 🐘',
      'Only you know. Sit with it — this little elephant will keep watch.',
      'No rush. Let it surface. I\'ll be here when it does.',
    ],
    zh: [
      '这个答案只有你知道——慢慢想，本象就在这儿陪着你。🐘',
      '只有你知道。静一静，本象替你守着门。',
      '不急，让它自己浮现。它出现时，本象还在。',
    ],
  },

  // demo 模式通用回复 (含注册 CTA — demo 漏斗功能保留)
  demo_default: {
    en: [
      'Every choice adds up — for your wallet and the planet. Sign up and Symy will help you see both. 🐘',
      'Small choices, big difference! Sign up and this little elephant will help you make them count.',
      'Symy helps you pause, see, and choose well. Sign up to start. 🐘',
    ],
    zh: [
      '每一次选择都在积累——对钱包，也对地球。注册后本象帮你把每一笔都看得明明白白。🐘',
      '小选择，大不同！注册后本象陪你把每个选择都做漂亮。',
      '本象帮你停一停、看清了再选。注册就开始吧！🐘',
    ],
  },

  demo_impulse: {
    en: [
      'It happens! Now we know — and next time Symy will trumpet a warning. Sign up to spot the pattern. 🐘',
      'No shame — it happens to the best of us. Sign up and we\'ll catch the next one together.',
      'Bought is bought. This little elephant won\'t judge — sign up to see what triggered it. 🐘',
    ],
    zh: [
      '没关系，谁还没有手滑的时候～注册后本象帮你看清模式，下次提前拦住你。🐘',
      '不怪你，真的。注册后咱们一起把下一个冲动拦在半路。',
      '买了就买了，本象不评判。注册后看看是什么触发了它。🐘',
    ],
  },

  demo_resist: {
    en: [
      'You saw it and the money stayed! Sign up to keep this winning streak going. 🐘',
      'Resisted! The money stays with you — sign up and Symy will celebrate every win with you.',
      'That\'s the spirit! The planet loves choices like this. Sign up to keep going. 🐘',
    ],
    zh: [
      '看见啦，钱也留住啦！注册后本象陪你把这份定力保持下去。🐘',
      '拦住了！注册后每一次胜利本象都陪你庆祝。',
      '就是这个气势！地球喜欢你这样的选择。注册后继续冲呀。🐘',
    ],
  },

  demo_refund: {
    en: [
      'Returned — money back where it belongs! Sign up to track what stays. 🐘',
      'Nice move! A return is the planet\'s favorite kind of shopping. Sign up to keep it up.',
      'Back it comes! This little elephant approves. Sign up to track your wins. 🐘',
    ],
    zh: [
      '退掉啦，钱回到它该在的地方！注册后本象帮你看着每一笔留住的钱。🐘',
      '漂亮！退货是地球最喜欢的购物方式。注册后继续保持～',
      '回来喽！本象很满意。注册后记录你的每一个小胜利。🐘',
    ],
  },

  demo_pattern: {
    en: [
      'Late-night scrolling, flash sales — the triggers are real. Sign up and Symy will help you spot yours. 🐘',
      'Patterns hide in plain sight. Sign up and this little elephant will help you map yours.',
      'The algorithm nudges, you get to see. Sign up to reveal your triggers. 🐘',
    ],
    zh: [
      '深夜刷手机、限时秒杀——诱导无处不在。注册后本象帮你认出自己的触发点。🐘',
      '模式就藏在日常里。注册后本象陪你把它画出来。',
      '算法在推，你来看见。注册后揭开自己的触发器。🐘',
    ],
  },

  demo_bnpl: {
    en: [
      'Buy Now Pay Later sounds soft, but the full price plus late fees can sneak up on you. Sign up to see the real total. 🐘',
      '4 easy payments... and one heavy total. Sign up and Symy will do the honest math with you.',
      'Split payments hide the full cost. This little elephant says: see the whole price first. Sign up! 🐘',
    ],
    zh: [
      '先享后付听起来轻松，但总价加上逾期费可不轻哦。注册后本象帮你算清真实成本。🐘',
      '「分 4 期很轻松」……加起来可是一大笔。注册后本象陪你诚实地算一算。',
      '分期把总价藏起来了。本象说：先看清整个价格。注册吧！🐘',
    ],
  },

  // demo 挑战后续消息 — 承认情绪 + 引导注册, 不复读 item/price/hours
  followup_default: {
    en: [
      'I hear you — wanting it is human. Let\'s just make sure it\'s a want worth its hours. Sign up to keep talking. 🐘',
      'Fair enough! This little elephant just wants the choice to be yours, not the ad\'s. Sign up to continue.',
      'Mm-hm. Take your time — good choices love a little patience. Sign up and we\'ll think it through. 🐘',
    ],
    zh: [
      '本象懂，喜欢是人之常情～咱们就确认一下，它值不值得用小时去换。注册后继续聊。🐘',
      '有道理！本象只是想让选择属于你，而不是属于广告。注册后接着说。',
      '嗯嗯，慢慢想——好选择喜欢一点耐心。注册后咱们一起琢磨。🐘',
    ],
  },

  followup_want: {
    en: [
      'Wanting it is okay! The question is whether it earns its spot. Symy can help you weigh it — sign up to continue. 🐘',
      'Want is easy — hours are real. Sign up and this little elephant will help you weigh it.',
      'I want things too... constantly. Sign up and we\'ll see if this one\'s worth it together. 🐘',
    ],
    zh: [
      '想要很正常呀！问题是要不要用小时换它。注册后本象帮你掂量掂量。🐘',
      '想要是一秒的事，小时可是实实在在的。注册后本象帮你称一称。',
      '本象也总想要这个想要那个……注册后咱们一起看看这个值不值。🐘',
    ],
  },

  followup_friends: {
    en: [
      'Friends have it — and ads are great at making it feel that way. What matters is what YOU need. Sign up to see clearly. 🐘',
      'Comparison is the algorithm\'s oldest trick. Your path is yours — sign up and let\'s walk it.',
      'They have it; do they love it? Only your needs count here. Sign up to talk it out. 🐘',
    ],
    zh: [
      '朋友有，广告也想让你觉得人人都有。重要的是你需不需要。注册后本象帮你看清。🐘',
      '「别人都有」是算法最老的把戏啦。你的路你自己走——注册后咱们慢慢聊。',
      '他们有，那他们喜欢吗？这里只有你的需要算数。注册后说给本象听。🐘',
    ],
  },

  followup_need: {
    en: [
      'If you truly need it, we\'ll find the smartest, greenest way to get it. Sign up and let\'s look together. 🐘',
      'Real need? Then let\'s do it well — right price, greener pick. Sign up to start.',
      'Need is honest. This little elephant loves honest shopping — sign up and we\'ll hunt smart. 🐘',
    ],
    zh: [
      '如果真的需要，那就买得聪明一点、环保一点。注册后本象陪你一起挑。🐘',
      '真需要？那就好好买——价格合适、选个更绿色的。注册后开始。',
      '需要就是需要，这很诚实。本象最喜欢诚实的购物——注册后一起聪明地找。🐘',
    ],
  },
  // batch48-b 反驳降温 — 用户说"我就要买"时小象不硬拦: 接受 + 愿望单 + 明天回访。
  // 红线: 零重复拦截 (不说"别买/再想想")、零羞辱回溯 (不提"上次也没忍住")、零金额零碳数值。
  cooldown_stepback: {
    en: [
      'Okay, I hear you — no more stopping you. Into the wishlist it goes, and tomorrow I\'ll come ask you just once: still want it? 🐘',
      'You decide, I guard the process. It\'s in your wishlist now, and tomorrow I\'ll check in with you — just once, promise. 🐘',
      'Deal, we\'ll do it your way. Wishlist first, and tomorrow at this time I\'ll ask if you still want it. 🌱',
    ],
    zh: [
      '好，本象听你的——不拦你啦。先放进愿望单，明天这个时候本象来问你一次：还想要吗？🐘',
      '你说了算，本象只陪过程。它进愿望单啦，明天我来问你一次——就一次，说定了。🌱',
      '行，就按你说的来。先记进愿望单，明天这个时间本象来问你还要不要它。🐘',
    ],
  },

  // batch48-b 反驳降温 (不耐烦档) — 用户嫌烦时更短更顺从, 少说一个字
  cooldown_stepback_annoyed: {
    en: [
      'Got it, got it — I\'ll hush. Wishlist, and I\'ll ask you just once tomorrow. 🌱',
      'Okay okay, no more words from me. It\'s in the wishlist — tomorrow, one question, that\'s all. 🐘',
    ],
    zh: [
      '好啦好啦，本象不说啦——进愿望单，明天只问一次。🌱',
      '收到收到，本象闭嘴。它进愿望单啦，明天问一次就好。🐘',
    ],
  },
  // batch50-a 买前三问迎接 — 用户主动求问时小象不说教: 陪着一起想清楚, 答案归用户。
  // 红线: 零拦截语气 (不说"别买/再想想"), 零羞辱 ("买吧"是正当选项), 零金额。
  prepurchase_welcome: {
    en: [
      'Good question — let\'s think it through together! I\'ll ask you three things, and by the end the answer will be yours. 🐘',
      'Love that you asked! Three little questions from this little elephant, and you\'ll know. 🐘',
      'Let\'s figure it out together — three questions, your answer. I\'m just here to walk with you. 🐘',
    ],
    zh: [
      '问得好——本象陪你一起想清楚！本象问你三个问题，答完答案就是你的了。🐘',
      '你来问本象真开心～三个小问题，答完你心里就有数了。🐘',
      '咱们一起捋一捋——三个问题，答案归你，本象只负责陪着走。🐘',
    ],
  },
  // batch53-a 绿色承诺迎接 — 用户许下口头承诺时郑重收下: 被记住的承诺才有力气,
  // 小象是守护者不是监工。红线: 零评判语气 (不说"你可要说到做到"), 零金额。
  commitment_welcome: {
    en: [
      'A promise to yourself — I heard it, and I\'ll remember it. Let\'s make it official? 🐘',
      'This little elephant never forgets a promise. Tap confirm and I\'ll guard it with you. 🌱',
      'You said it, I caught it — shall we lock it in together? 🐘',
    ],
    zh: [
      '你对自己许的愿，本象听见了，也会一直记得。要不要正式记下来？🐘',
      '小象最不会忘记承诺啦——点个确认，本象陪你一起守。🌱',
      '这句话本象接住啦！我们把它记成一个小小约定，好不好？🐘',
    ],
  },
  // batch56-a 对比裁决迎接 — 二选一是客单最高的决策时刻, 小象的角色是"帮我做
  // 决定的绿色搭子"不是裁判: 先接住选择, 裁决留给卡上的三行证据。红线: 不站队
  // (不在迎接语里偏向任一侧), 零评判零金额。
  compare_welcome: {
    en: [
      'Two roads, one pick — let me lay out what I know, the choice stays yours. 🐘',
      'Good question! I\'ll put the green lens on both sides — you make the call. 🐘',
      'Let\'s weigh them together — need, greener options, durability. Your call at the end. 🌱',
    ],
    zh: [
      '二选一不着急——本象把绿色视角摆出来，最后你说了算。🐘',
      '问得好！两条路本象都帮你照一照，决定权在你手里。🌱',
      '咱们一起掂量掂量——需要、替代、耐用，三行摆完你来选。🐘',
    ],
  },
  // batch57-a 清单分诊迎接 — 小象从"单件把关"升级为"帮我把关整张购物清单":
  // 先接住整张清单, 分诊留给卡上的逐条三态。红线: 绿灯不是恩准 (是"这项没
  // 风险"的平静陈述), 不预评判任何条目, 零金额零碳数值。
  list_triage_welcome: {
    en: [
      'A whole list! Hand it over — I\'ll go through it item by item, you make the calls. 🐘',
      'Love a good list! Let me put the green lens on each one — green light, swap, or think twice. 🌱',
      'Shopping list checkpoint! I\'ll triage every item, then the list is still yours. 🐘',
    ],
    zh: [
      '一整张清单！交给本象——逐条帮你过一遍，最后每一条都你说了算。🐘',
      '清单收到！每一样都照照绿色视角——放行、替代、再想想，三种结果摆给你看。🌱',
      '购物清单过关卡！本象逐条分诊完，清单还是你的清单。🐘',
    ],
  },
  // batch57-c 问账开场 — 小象是随时能对账的管账搭子: 账单在卡上, 一笔一笔
  // 说得清。红线: 话术里不报具体数字 (数字只出自聚合卡), 不评头论足。
  savings_query_welcome: {
    en: [
      'Of course — let\'s check the books together. Every number is on the card, straight from your own record. 🐘',
      'Love this question! Here\'s your honest tally — counts, hours and all. 🌱',
      'The ledger\'s right here. Nothing rounded up, nothing made up. 🐘',
    ],
    zh: [
      '对账嘛，本象最擅长——每一笔都在卡上，全是你自己攒下的记录。🐘',
      '问得好！账单一笔一笔摆给你看，次数、小时，清清楚楚。🌱',
      '账本在这儿呢。不虚报一个数，也不含糊一句话。🐘',
    ],
  },
  // batch57-c 问账空窗 — 该窗还没开张: 引导下一单叫上小象, 不羞辱不造假。
  savings_query_empty: {
    en: [
      'Fresh page this window — nothing to tally yet. Bring me along on your next order and we\'ll start the count. 🌱',
      'No entries yet — the ledger\'s still blank, and that\'s okay. Next purchase, call me in. 🐘',
      'Nothing on the books for this one yet. The first entry is always the sweetest — let\'s make it together. 🐘',
    ],
    zh: [
      '这一页还是空的——还没开张呢。下一单叫上本象，咱们把第一笔记上。🌱',
      '账本暂时空白，没关系。下次想买什么先来找本象，一笔一笔记起来。🐘',
      '这阵子还没入账。第一笔最珍贵，下一单一起开张吧。🐘',
    ],
  },
  // batch58-c 分类问答开场 — 小象记得更细: 不止总账, 每一类都记得。红线:
  // 话术不报数字 (数字只出自聚合卡), 不评头论足, 次数是守住的第几棒。
  category_query_welcome: {
    en: [
      'Of course — I keep the fine-grained ledger too. Every count is on the card, straight from your own record. 🐘',
      'You ask, I remember! This category\'s tally is right on the card. 🌱',
      'The category pages are right here — nothing rounded up, nothing made up. 🐘',
    ],
    zh: [
      '问到细处了！本象的账本每一类都分开记——次数都在卡上，全是你自己的记录。🐘',
      '这一类我也记着呢——一笔一笔摆给你看，清清楚楚。🌱',
      '分类账在这儿。不虚报一个数，也不含糊一句话。🐘',
    ],
  },
  // batch58-c 分类问答空窗 — 该窗还没有任何守护记录: 引导开张, 不羞辱不造假。
  category_query_empty: {
    en: [
      'This window\'s ledger is still blank — bring me along next time and we\'ll start the count. 🌱',
      'Nothing on the books yet for this stretch. The first entry is always the sweetest. 🐘',
    ],
    zh: [
      '这一页还没开张呢——下一单叫上本象，咱们把第一笔记上。🌱',
      '账本暂时空白，没关系。下一单一起开张吧。🐘',
    ],
  },
  // batch58-c 时段问答开场 — 小象照见规律 (不是审判): 看见时段, 就多了一分自由。红线:
  // 不渲染成 "你深夜败了多少次", 次数/天数只在卡上, 话术不报数。
  impulse_query_welcome: {
    en: [
      'Good question — let\'s look at the pattern together. Counts and days are on the card, nothing more. 🐘',
      'Patterns are just information! Here\'s when your guard moments landed. 🌱',
      'Let me hold up the mirror gently — the timing is all on the card. 🐘',
    ],
    zh: [
      '咱们一起看看规律——次数和日子都在卡上，看见了就多一分自由。🐘',
      '规律只是信息，不是审判！时段分布给你摆出来了。🌱',
      '本象轻轻照一照——什么时候发生的，卡上说得清清楚楚。🐘',
    ],
  },
  // batch58-c 时段问答样本不足 — 还没攒够数据, 不造伪规律。
  impulse_query_empty: {
    en: [
      'Not enough entries yet to see a pattern honestly. A few more guard moments and I\'ll have a real answer. 🌱',
      'Still collecting — I won\'t invent a rhythm you don\'t have. 🐘',
    ],
    zh: [
      '还没攒够数据，本象不瞎猜——多攒几次守护，规律自然浮出来。🌱',
      '样本还不够呢。不造一个你没有的规律出来。🐘',
    ],
  },
  // batch59-c 追问跟随开场 — 同一本账掀新一页: 记得上文, 数字只出自聚合卡。
  followup_query_welcome: {
    en: [
      'Sure — flipping to that page now. Same ledger, fresh numbers on the card. 🐘',
      'Still with you! Here\'s that slice, straight from your own record. 🌱',
      'One more page of the same honest ledger — nothing rounded up. 🐘',
    ],
    zh: [
      '好嘞——同一本账，帮你翻到这一页，数字都在卡上。🐘',
      '还记着刚才问的呢！这一段也给你摆出来，清清楚楚。🌱',
      '账本接着翻——不虚报一个数，也不含糊一句话。🐘',
    ],
  },
  // batch60-c 情绪守护开场 — 先接住情绪, 不评判不拦截: 买不买、怎么安抚, 选择权在用户。
  // 红线: 无羞辱、无 "别买/不能买" 措辞, 不做心理健康诊断承诺。
  emotion_guard_welcome: {
    en: [
      'That sounds heavy — I\'m here first. Whatever helps you feel better, we can take it slow. 🐘',
      'Come here, this little elephant has got you. Nothing needs deciding in a hurry. 🌱',
      'I hear you — feelings come first, everything else can wait. I\'m right here. 🐘',
    ],
    zh: [
      '听起来今天很不容易——本象先在。想怎么让自己舒服点，咱们慢慢来。🐘',
      '过来抱一下。什么都不急着决定，先喘口气。🌱',
      '本象收到你的心情了。情绪优先，别的都可以等等——我一直在。🐘',
    ],
  },

  // batch61-b 促销降温迎接 — 倒计时/最后几件是话术不是deadline; 拆话术不拆人,
  // 不嘲讽不劝退, 给愿望单 + 次日一问的台阶 (与 48-b 冷静卡动作对齐)。
  promo_pressure_welcome: {
    en: [
      'The countdown is a tactic, not a deadline. Into the wishlist it goes — tomorrow I\'ll ask you just once: still want it? 🐘',
      '\'Last few items\' always come back next week. Let it cool off in the wishlist — one question tomorrow, promise. 🌱',
      'Sales shout, but your decision doesn\'t have to rush. Wishlist first; I\'ll check in tomorrow, just once. 🐘',
    ],
    zh: [
      '倒计时是话术，不是你的决定。先放进愿望单凉一晚，明天这个时候本象只问一次：还想要吗？🐘',
      '「最后三件」下周还会有新的「最后三件」。让子弹飞一会儿——进愿望单，明天问一次就好。🌱',
      '促销喊得急，你的决定不用急。先记进愿望单，明天本象来问一次——就一次，说定了。🐘',
    ],
  },
  // batch62-c 预报开场 — 小象把下一周的规律提前圈出来: 规律来自用户自己的
  // 记录, 提前安排就多一分自由。红线: 话术不报数字 (数字只出自聚合卡),
  // 不承诺准确率, 不制造焦虑 ("容易/可以准备", 不说 "你会失控")。
  forecast_welcome: {
    en: [
      'Let\'s peek at the week ahead — the pattern comes straight from your own records, so we can get ready early. 🐘',
      'Good thinking! Here\'s when temptation tends to knock, so nothing catches you off guard. 🌱',
      'Your records already know the rhythm — I just circled the days. Ready-ahead mode on! 🐘',
    ],
    zh: [
      '咱们提前看一眼下一周——规律全来自你自己的记录，早看见就能早准备。🐘',
      '会安排的人最从容！这是你的冲动容易来敲门的日子，咱们先把替代动作备好。🌱',
      '你的记录里其实藏着节奏——本象只是把日子圈出来。提前准备，稳稳的。🐘',
    ],
  },
  // batch62-c 预报样本不足 — 近 8 周记录还不够, 如实降级, 不造伪规律。
  forecast_empty: {
    en: [
      'Not quite enough records yet for an honest forecast — keep logging guard moments and this forecast will open up. 🌱',
      'I won\'t invent a rhythm you don\'t have. A few more weeks of entries and the forecast turns real. 🐘',
    ],
    zh: [
      '记录还没攒够，本象不瞎预报——多攒几次守护，预报自然开张。🌱',
      '还看不准呢。不编一个你没有的规律出来，再攒几周就准能看了。🐘',
    ],
  },
  // batch62-c 预报单日追问 — "那周六呢": 帮用户翻到那一页, 风险和时段都在卡上。
  forecast_day_followup: {
    en: [
      'Flipping to that day now — its risk and timing are right on the card. 🐘',
      'Good pick! Here\'s that day\'s page of the same honest forecast. 🌱',
    ],
    zh: [
      '帮你翻到那一天——风险和时段都在卡上。🐘',
      '问到点子上了！这一天的预报给你单独翻开。🌱',
    ],
  },
  // batch68-c 脉搏开场 — 小象照见一天里的节奏 (不是审判): 知道高峰时段,
  // 就能提前一步安排。红线: 话术不报数字 (小时/次数/天数只在卡上), 非羞辱框架。
  guard_pulse_welcome: {
    en: [
      'Let\'s read your daily rhythm — hours and days are on the card, straight from your own records. 🐘',
      'Your own data keeps the beat! Knowing your peak hours means you can plan one step ahead. 🌱',
    ],
    zh: [
      '来看看你一天里的节奏——小时和天数都在卡上，全是你自己的记录。🐘',
      '你的数据自己会打拍子！知道了高峰时段，就能提前一步安排好。🌱',
    ],
  },
  // batch68-c 脉搏样本不足 — 28 天记录还不够, 如实降级, 不造伪节奏。
  guard_pulse_empty: {
    en: [
      'Not enough entries yet to hear your rhythm honestly — a few more guard moments and the pulse shows up. 🌱',
      'I won\'t invent a rhythm you don\'t have. Keep logging, and your beat will find us. 🐘',
    ],
    zh: [
      '记录还没攒够，本象不瞎猜节奏——多攒几次守护，脉搏自然显出来。🌱',
      '样本还不够呢。不编一个你没有的节奏出来，再攒攒准能听见。🐘',
    ],
  },
};

/**
 * 把任意 locale 字符串归一化为 en | zh (未知/缺失 → en) */
export function normalizeElephantLocale(locale: string | undefined | null): ElephantLocale {
  return locale && locale.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

/**
 * 兜底变量 (调用方拿不到精确金额/小时数时用, 避免占位符残留或中英混排)。
 * 用法: { ...elephantGenericVars(locale), amount: '$46.80' } — 已知字段覆盖未知字段。
 */
export function elephantGenericVars(locale: string | undefined | null): Record<string, string> {
  return normalizeElephantLocale(locale) === 'zh'
    ? { amount: '这笔钱', hours: '那些小时' }
    : { amount: 'That money', hours: 'those hours' };
}

/**
 * 时长变量: 数值 → 带单位的完整时长短语 ({hours} 占位符约定)。
 * '55' + zh → '55 小时'; '55' + en → '55 hours'。
 */
export function elephantHours(value: string | number, locale: string | undefined | null): string {
  return normalizeElephantLocale(locale) === 'zh' ? `${value} 小时` : `${value} hours`;
}

/**
 * 金额变量: 数值 → 含符号金额 ({amount} 占位符约定)。
 * 产品当前统一用 $ 展示 (见 symy_currency context), 双语一致。
 */
export function elephantMoney(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** 简单 {key} 插值 — 未知占位符原样保留 (便于发现传参遗漏) */
export function interpolateElephantTemplate(
  template: string,
  vars: Record<string, string | number> | undefined,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

/**
 * 取一句话术 (随机轮换)。rng 可注入以便测试确定性。
 */
export function pickElephantPhrase(
  scene: ElephantScene,
  locale: ElephantLocale,
  rng: () => number = Math.random,
): string {
  const pool = ELEPHANT_PHRASES[scene][locale];
  return pool[Math.floor(rng() * pool.length) % pool.length];
}

/**
 * 一步到位: 场景 + locale + 变量 → 成品话术。
 * 这是 fallback 消息/通知的统一入口。
 */
export function getElephantPhrase(
  scene: ElephantScene,
  locale: string | undefined | null,
  vars?: Record<string, string | number>,
  rng: () => number = Math.random,
): string {
  const normalized = normalizeElephantLocale(locale);
  return interpolateElephantTemplate(pickElephantPhrase(scene, normalized, rng), vars);
}
