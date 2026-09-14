/**
 * green-alt-entries-digital-content — 数字内容词条 (zh+en 双语)
 *
 * 词条结构见 green-alt-types.ts。顺序追加在 office 之后 (数组末位)。
 * 本域接住的是「数字内容型消费」: 电子书重复购买、有声书/课程囤积、
 * 云存储膨胀、音乐重复购买、字体/素材/模板冲动——永远不用物流、
 * 即时满足、单价看着便宜, 比实物更容易无痛囤积。
 *
 * 域内顺序: 按囤积场景从「内容」到「空间」再到「素材工具」排列;
 * 与既有域的重叠词全部让位先注册域 (测试锁定):
 *   - '买书' 系留 office 域 (纸质/教材语境), 本域 '电子书' 不含 '买书' 子串
 *   - '囤课'/'买网课' 留 subscription 域 activate_before_buy (先激活旧卡语义),
 *     本域走 '网课'/'买了一门课' 等囤积形态词, 含 '买网课'/'囤课' 的查询先中对方
 *
 * en 触发词红线: 禁裸 'course' ('of course' 高频误伤), 禁含
 * 'online course'/'stock up on courses' 子串 (subscription 域已持有),
 * 禁裸 'ebook'/'ebooks' ('notebook'/'notebooks' 尾部含 'ebook',
 * office 域 'a plain notebook' 不误伤红线), 一律用 'e-book'/
 * 'buying ebooks'/'buy ebooks' 等带边界形态。
 *
 * 文案红线 (与既有域同款): 不说教, 无碳足迹数值, 无金额承诺,
 * 荣誉框架——「清醒拥有数字书架/资源库」是体面, 「避免重复付费」
 * 是里子; 绝不暗示「你穷」。
 *
 * 绿色偏好开关 (symy_green_pref === 'off') 由调用方判断, 词条层不特判。
 */

import type { GreenAlternativeEntry } from './green-alt-types';

export const GREEN_ALT_ENTRIES_DIGITAL_CONTENT: readonly GreenAlternativeEntry[] = [
  {
    id: "ebook_repurchase",
    triggers: {
      zh: ["电子书", "囤电子书", "买电子书", "电子书城"],
      en: ["e-book", "buying ebooks", "buy ebooks", "kindle books"],
    },
    why: {
      zh: "电子书的「拥有」发生得太安静: 下单一秒后书就到了, 拥有感来得毫不费力, 书架于是越堆越高, 真正翻开的比例却越来越低——重复购买往往不是缺书, 是忘了自己已经买过。",
      en: "Digital books make owning effortless: the purchase lands a second after checkout, the shelf stacks up fast, and the share actually opened keeps shrinking — rebuying is rarely about missing a book, more about forgetting it is already yours.",
    },
    options: {
      zh: ["下单前先搜一遍已购列表", "图书馆账号先借一本", "读完一本再买下一本"],
      en: ["Search your purchased list before checkout", "Borrow from the library first", "Finish one before buying the next"],
    },
    reuseChannel: {
      zh: "先打开购书账户里的「已购」列表和阅读器本地书架, 大多数账号都支持按书名搜索已购; 公共图书馆的数字借阅凭读者证大多免费开通, 样章加借阅能覆盖大部分「想读」的瞬间。",
      en: "Open your retailer's purchased list and the reader's local shelf first — most accounts let you search what you already own; public library digital lending is usually free with a library card, and samples plus borrows cover most want-to-read moments.",
    },
    alternative: {
      zh: "下单电子书之前先搜一遍已购列表: 数字书的拥有发生得太安静, 重复购买多半是忘了而非没买——查一次只要几秒, 书架清爽, 钱包也跟着清爽。",
      en: "Search your purchased list before checkout: digital ownership arrives silently, and rebuying is usually forgetting, not wanting — the check takes seconds and keeps both your shelf and your wallet honest.",
    },
    reuse: {
      zh: "已购未读的书才是真正的存货: 把书架按「想读/在读/读完」分个类, 下次想买的冲动来时先从「想读」里挑一本——囤过的每一本都值得被翻开, 而不是被重复付费。",
      en: "The unread books you already own are the real stockpile: sort your shelf into want, reading and finished, and when the urge to buy strikes, pick from the want pile first — every book you hoarded deserves to be opened, not paid for twice.",
    },
    savingsHint: {
      zh: "下单前先翻翻自己的数字书架, 想读的那本也许早就安静躺在已购列表里。",
      en: "Before checkout, browse your digital shelf — the book you want may already be sitting quietly in your purchased list.",
    },
  },
  {
    id: "audiobook_stockpile",
    triggers: {
      zh: ["有声书", "听书", "有声剧"],
      en: ["audiobook", "audio book", "audible"],
    },
    why: {
      zh: "有声书的「攒」最不显形: 一本本加进书架像在充实自己, 未听完的列表却越拉越长——听书的价值在听完, 不在拥有。",
      en: "Audiobook hoarding is the quietest kind: adding titles feels like self-improvement while the unfinished list grows longer — the value lives in the listening, not the owning.",
    },
    options: {
      zh: ["未听完不新开一本", "图书馆账号免费借听", "订阅曲库先搜再买断"],
      en: ["Finish the current title before a new one", "Borrow free from your library account", "Search your subscription library before buying outright"],
    },
    reuseChannel: {
      zh: "公共图书馆的听书资源最常被忽略: 读者证开通后大多免费; 已订阅应用的会员曲库能覆盖大半想听的单本——先把存货听完, 再谈新入手。",
      en: "Library audiobook lending is the most overlooked free channel, usually unlocked with a library card; and the membership catalogs of apps you already pay for cover most single titles — finish the stockpile before adding new.",
    },
    alternative: {
      zh: "想开新的一本之前先问一句: 上一本听完了吗? 「完结一本再开下一本」是有声书最舒服的节奏——订阅库和图书馆里没听完的, 都是已经付过费的时间。",
      en: "Before starting a new title, ask one question: did the last one get finished? One at a time is audiobooks' natural rhythm — what sits unfinished in your subscription or library queue is time already paid for.",
    },
    reuse: {
      zh: "通勤和家务时间是现成的听书时段: 把未听完的那本置顶, 一周就能还清「听书欠账」——清完欠账再开新书, 每一集都是新鲜的。",
      en: "Commutes and chores are ready-made listening hours: pin the unfinished title and clear the backlog within a week — every new chapter sounds fresher with no debt behind it.",
    },
    savingsHint: {
      zh: "新开一本之前, 先看看订阅库和图书馆里没听完的那本, 它还在等你。",
      en: "Before starting a new title, check the unfinished one in your subscription or library — it is still waiting for you.",
    },
  },
  {
    id: "course_backlog_first",
    triggers: {
      zh: ["网课", "买了一门课", "买新课", "课程囤积"],
      en: ["course backlog", "bought another course", "hoarding courses", "unfinished courses"],
    },
    why: {
      zh: "线上课程把「变好的愿望」放进了购物车: 买下的瞬间就预支了上进的满足感, 完课率却常年安静——课程的价值在学完, 囤积只是愿望的堆积。",
      en: "Online courses put the wish of getting better straight into the cart: buying pre-pays the feeling of progress while completion rates stay quietly low — the value lives in finishing, and stockpiling is just accumulated intention.",
    },
    options: {
      zh: ["先列未完成课程清单", "完结一节再买下一门", "免费试听验证真兴趣"],
      en: ["List your unfinished courses first", "Finish a section before buying the next course", "Use free previews to test real interest"],
    },
    reuseChannel: {
      zh: "打开已购课程的账户中心, 把「未完成」的列一张清单, 大多数平台的学习进度都还在——先从最早那门捡起来, 它才是你真正想要的那门课的起点。",
      en: "Open your course accounts and list everything unfinished — most platforms still keep your progress; pick up the oldest one first, it is where the course you actually wanted begins.",
    },
    alternative: {
      zh: "买新课之前先立一条小规矩: 「完结一节, 再买下一门」——已购清单里每一门没上完的课, 都是过去的你认真挑过的; 先把它们变成本事, 再让新课进来。",
      en: "Set one small rule before the next purchase: finish a section, then buy the next course — every unfinished one on your shelf was picked carefully by a past you; turn those into skills before letting new ones in.",
    },
    reuse: {
      zh: "未完成的课程清单不是欠账, 是已经买好的未来: 从最短的那门开始, 每完结一节都算数——清完一门, 你就多了一门真本事。",
      en: "The unfinished list is not debt, it is a future already paid for: start with the shortest course and every finished section counts — clear one, and you own one more real skill.",
    },
    savingsHint: {
      zh: "想买新课的时候, 先看看已购里那门没学完的——它离「学会」只差你打开它。",
      en: "Before the next course, open the unfinished one in your library — it is one click away from being the skill you wanted.",
    },
  },
  {
    id: "cloud_storage_declutter",
    triggers: {
      zh: ["网盘扩容", "云存储", "扩容", "云盘满了"],
      en: ["cloud storage", "storage plan", "buy more storage", "upgrade storage"],
    },
    why: {
      zh: "云端不是无限的天空, 只是按月续费的架子: 存进去的照片、视频和大附件不整理, 空间就自己长胖——多数「空间不足」的提示, 缺的不是容量, 是一次清理。",
      en: "The cloud is not endless sky, it is a monthly-rented shelf: photos, videos and heavy attachments pile up unsorted until space runs out — most full-storage warnings are missing a cleanup, not capacity.",
    },
    options: {
      zh: ["先清重复照片和视频", "大附件下载后从云端移除", "家庭共享组分摊空间"],
      en: ["Clear duplicate photos and videos first", "Download big attachments, then remove them from the cloud", "Share space through a family group"],
    },
    reuseChannel: {
      zh: "大多数云盘自带「空间管家」: 重复文件识别、大文件排序、久未访问列表一应俱全——半小时的清理常常比升一年档位更管用; 家人共享组则能把同一份容量用在刀刃上。",
      en: "Most cloud drives ship a storage manager: duplicate finders, largest-file sorts, rarely-accessed lists — half an hour of tidying often beats a year of upgraded tiers, and a family group puts the same space to work for everyone.",
    },
    alternative: {
      zh: "收到「空间已满」先做一次清理: 重复照片、早该下载的大附件、看完即弃的视频清掉, 空间常常自己回来了; 真还缺, 短期扩容或家庭共享分摊, 都比常年顶格买单更从容。",
      en: "When storage fills up, clean before upgrading: duplicates, overdue downloads and watched-once videos often return a surprising chunk of space; if you still need more, a short-term tier or family sharing stays calmer than paying top price year-round.",
    },
    reuse: {
      zh: "清理过的云盘像收拾过的房间: 找东西快了, 留下的每一张照片都是真的想留——数字书架和资源库的清爽, 是整理给的, 不是扩容给的。",
      en: "A decluttered drive feels like a tidied room: search gets faster, and every kept photo is one you truly wanted — the lightness of a digital shelf comes from order, not from extra gigabytes.",
    },
    savingsHint: {
      zh: "升级容量之前, 先做一次重复文件清理, 空间也许已经够用。",
      en: "Before upgrading, run a duplicate cleanup — the space you need may already be there.",
    },
  },
  {
    id: "music_repurchase",
    triggers: {
      zh: ["数字专辑", "买专辑", "整张专辑", "买数字音乐"],
      en: ["digital album", "buy the album", "buying the album", "buying albums", "album preorder"],
    },
    why: {
      zh: "数字音乐时代, 「重复购买」有了新形态: 同一首歌可能同时躺在歌单、下载和某张为情怀买下的专辑里——为单曲买断整张, 是这个时代最常见的温柔重复。",
      en: "In the streaming era, rebuying wears a new face: the same song can sit in your playlists, your downloads and a full album bought for one track — buying twelve songs to hear one is the era's gentlest duplicate.",
    },
    options: {
      zh: ["优先单曲购买", "先翻现有歌单", "电台与免费渠道先听"],
      en: ["Buy the single, not the album", "Check your existing playlists first", "Try radio and free channels first"],
    },
    reuseChannel: {
      zh: "买之前先翻自己的歌单: 相似心情的收藏往往已经够听; 订阅应用的电台和每日推荐能听个够——真想支持喜欢的歌手, 单曲和一场演出都比整张专辑更对味。",
      en: "Flip through your playlists first: favorites in a similar mood are often enough, and radio plus daily mixes in your subscription cover the listening — when you truly want to back an artist, a single or a show ticket lands closer to the mark than a full album.",
    },
    alternative: {
      zh: "为一首歌买整张专辑之前, 先确认与其余几首的缘分: 单曲购买、现有歌单和免费电台往往已经够用——真金的支持留给反复循环的那几首, 这样的支持更清醒, 也更有分量。",
      en: "Before buying a whole album for one song, check the chemistry with the rest: the single, your playlists and free radio usually suffice — reserve real support for the tracks on endless repeat; support that sober lands heavier.",
    },
    reuse: {
      zh: "自己收拾出来的歌单是时间的收藏: 每首都带着当时的场景——重复付费买不回那份贴合, 只会稀释它。",
      en: "A playlist you curated is a collection of moments: every track carries where you were — paying twice cannot deepen that fit, only dilute it.",
    },
    savingsHint: {
      zh: "买整张专辑前先翻翻歌单, 想听的那首也许早就躺在你的收藏里。",
      en: "Before the full album, check your playlists — the song you want may already be in your favorites.",
    },
  },
  {
    id: "design_asset_single_buy",
    triggers: {
      zh: ["买字体", "字体授权", "字体素材", "设计素材", "买模板", "素材包", "商用授权"],
      en: ["buy fonts", "font license", "design assets", "buy templates", "asset pack", "stock assets"],
    },
    why: {
      zh: "素材库的促销逻辑是「先囤再说」: 大礼包看着全能, 真正打开的往往只有下载那天的那一次——字体和模板的价值在被使用, 不在被持有。",
      en: "Asset libraries sell stockpile-first logic: the bundle looks all-purpose, yet what gets opened is usually that first download — fonts and templates hold value by being used, not owned.",
    },
    options: {
      zh: ["先查已购授权覆盖范围", "免费商用替代先试", "按单个项目需要购买"],
      en: ["Check what your existing licenses cover", "Try free-for-commercial alternatives", "Buy per project, only what it needs"],
    },
    reuseChannel: {
      zh: "买新素材前先做两步: 翻一遍已购字体和模板的授权范围, 很多旧授权比你记得的覆盖更广; 再逛一圈免费商用库——开源字体和社区模板的质量, 常常超出预期。",
      en: "Two steps before new assets: review what your purchased licenses already cover — old grants reach further than memory suggests — then browse the free-for-commercial libraries, where open-source fonts and community templates regularly outperform expectations.",
    },
    alternative: {
      zh: "看上素材大礼包时, 把它拆回项目尺寸: 这个项目真正需要的可能只是一款标题字体加一套版式——按单个项目购买, 授权清爽, 资源库也不再膨胀; 「需要时再买」是创作者最利落的节奏。",
      en: "When a bundle catches your eye, resize it to the project: what it truly needs may be one display face plus one layout kit — buying per project keeps licenses clean and the library lean; buy-when-needed is a creator's sharpest rhythm.",
    },
    reuse: {
      zh: "用熟的几款字体会长出「个人笔迹」: 作品因此连贯, 识别度因此长出来——素材库的深度比不上风格的稳定, 这才是创作者的荣誉。",
      en: "A few well-worn fonts grow into a personal hand: work turns coherent and recognizably yours — depth of library matters less than steadiness of style, and that steadiness is the creator's real honor.",
    },
    savingsHint: {
      zh: "买新素材前先查一遍已购授权, 需要的也许已经在你的库里。",
      en: "Before new assets, review your existing licenses — what you need may already be in your library.",
    },
  },
];
