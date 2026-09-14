/**
 * green-alt-entries-office — 办公学习词条 (zh+en 双语)
 *
 * 词条结构见 green-alt-types.ts。顺序追加在 garden 之后 (数组末位)。
 * 本域接住的是「开学/办公置办」的复购型消费: 教材课本、文具、打印、
 * 开学季囤货——二手教材市场成熟、笔芯替换立竿见影、低频打印
 * 设备闲置是最大浪费, 且学生党预算语境让节俭叙事全暖色。
 *
 * 域内顺序 (匹配即优先级): 具体触发词在前, 泛化词垫底——
 * textbook_secondhand 最前 ('买教材' 含 '教材', 先于 digital_first
 * 的 '买书' 泛词); stationery 的 '笔芯'/'中性笔' 先于其自身 '文具'
 * 泛词; printer_borrow 在 back_to_school_cooldown 之前,
 * cooldown 域内垫底 (泛促销词, 同 furniture 域 72h 冷静期先例)。
 *
 * en 触发词红线: 禁裸 'pen'/'pens' ('open'/'cheap' 含 'pen',
 * 'expenses'/'opens' 含 'pens', 长尾误伤), 一律用复合词
 * ('buy pens'/'buy gel pens'/'pens for school'; 注意 'pen refills' 也不行
 * — 美妆域 beauty_refill 持有 'refill', 会先中); 禁裸 'notebook'
 * ("a plain notebook" 这类日常提及
 * 不该触发, 用 'new notebook'/'buy notebooks')。
 * zh 触发词红线: 禁裸 '笔记本' (electronics 域已持有, 指笔记本电脑),
 * 纸本语境用 '活页本'/'新的本子'/'买本子'。
 *
 * 文案红线 (与既有域同款): 不说教, 无碳/环保数值, 荣誉框架,
 * 学生党预算语境全暖色 (会省是聪明, 不是将就); 省钱数学
 * (新旧书价差、笔芯对整笔、打印单张对设备摊销) 只进 suggestion
 * 文案, 绝不进 share/honor 面; why 字段 digit-free (全局红线)。
 *
 * 绿色偏好开关 (symy_green_pref === 'off') 由调用方判断, 词条层不特判。
 */

import type { GreenAlternativeEntry } from './green-alt-types';

export const GREEN_ALT_ENTRIES_OFFICE: readonly GreenAlternativeEntry[] = [
  {
    id: "textbook_secondhand",
    triggers: {
      zh: ["教材", "课本", "二手课本", "上学期的书"],
      en: ["textbook", "used textbooks", "secondhand textbooks", "course books"],
    },
    why: {
      zh: "教材是最标准的「一学期之物」: 结课那天它的使命就完成了, 内容却一个字没变。每年都有上一届把九成新的课本挂出来等下一个人——你想要的这本书, 大概率正有人在等低价出掉。",
      en: "Textbooks are the definition of one-semester goods: the day the course ends, their job is done, yet not a word inside has changed. Every term, the previous cohort lists barely-used copies waiting for the next reader — the very book you need is probably sitting there, priced to go.",
    },
    options: {
      zh: ["二手平台/校园集市收上届课本", "问学长学姐有没有留存", "和同学拼一套轮着用"],
      en: ["Grab last cohort's copies on resale or campus markets", "Ask seniors if they kept theirs", "Share one set with a classmate in rotation"],
    },
    reuseChannel: {
      zh: "闲鱼、校园二手群和毕业季跳蚤市场是教材的主场: 毕业生甩卖时整套出、近乎白送; 收的时候认准版次, 老一版便宜更多、内容九成九没动。用完别扔——挂回群里, 它还有下一届要见。",
      en: "Resale apps, campus secondhand groups and graduation flea markets are textbook territory: departing students sell whole sets for next to nothing; just check the edition, where an older printing costs less and barely differs. And when your course ends, don't bin it — relist it, it still has a next cohort to meet.",
    },
    alternative: {
      zh: "买全新教材前先看二手价: 九成新课本的二手价常只是新书的一小半, 一学期五六门课的价差加起来相当可观——省下的差额留给真正想留下的那几本, 其他的, 用过就是它的全部价值。",
      en: "Check secondhand pricing before buying new: a barely-used copy often runs well under half of retail, and across a term's worth of courses the gap adds up fast — keep the difference for the few books you'll actually keep; for the rest, having served you once is their whole value.",
    },
    reuse: {
      zh: "课本上的划线和笔记是「被人认真读过」的证明: 收到一本带着前辈重点的书, 等于附赠了一份免费导读——你转手时留下的笔记, 也会帮到下一个人。",
      en: "Underlines and margin notes are proof a book was properly read: a copy with a predecessor's highlights comes with a free guided tour — and the notes you leave behind will do the same for whoever's next.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "textbook_digital_first",
    triggers: {
      zh: ["买书", "买新书", "新书"],
      en: ["buy the book", "buy a new book", "buy books"],
    },
    why: {
      zh: "下单纸质书之前, 有两道免费的门常被跳过: 电子版和图书馆。很多教材有官方电子版, 便携还能检索; 学校和市图书馆的馆藏里, 经典书几乎都在架上——先问一句「有没有不用买的版本」, 是读书人最划算的习惯。",
      en: "Before ordering the paper copy, two free doors usually get skipped: the digital edition and the library. Many textbooks ship official e-versions, portable and searchable; and in school or city library catalogs, the classics are nearly all on the shelf — asking is there a version I don't have to buy is a reader's most profitable habit.",
    },
    options: {
      zh: ["先查电子版有没有", "图书馆预约一趟", "书店翻完再决定买不买"],
      en: ["Check for the digital edition first", "Place a library hold", "Browse it in a bookstore before deciding"],
    },
    reuseChannel: {
      zh: "查书顺序建议: 馆藏 → 电子版 → 二手 → 全新。图书馆一次能借不少本, 续借一次基本覆盖一学期; 电子版常随纸质版打折一起出。真看完想留在书架上的, 再买不迟——那时你也确定它值得。",
      en: "A sensible lookup order: library catalog, digital edition, secondhand, then new. Libraries lend plenty at once and one renewal usually covers a term; e-versions often discount alongside print. Buy only what you finish and still want on the shelf — by then you know it's earned the spot.",
    },
    alternative: {
      zh: "买书前先过一遍免费渠道: 馆藏和电子版能覆盖大部分阅读需求, 真正值得常驻书架的书比想象中少——为「可能想重读」提前付的纸质全价, 大部分最后变成了搬家时的纸箱重量。",
      en: "Run the free channels before checkout: library and digital cover most reading needs, and the books truly worth shelf space are fewer than expected — the full print price paid for might-reread-someday mostly ends up as box weight on moving day.",
    },
    reuse: {
      zh: "「先借后买」筛出来的书架, 本本都是经过验证的爱: 留下来的每一本你都读过一半以上——这比囤出来的书墙更接近读书本身。",
      en: "A shelf filtered by borrow-first holds only proven love: every book on it made it past the halfway mark — closer to what reading actually is than any wall of stockpiled spines.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "stationery_refill",
    triggers: {
      zh: ["笔芯", "中性笔", "买笔", "文具"],
      en: ["buy pens", "new pens", "pens for school", "buy gel pens"],
    },
    why: {
      zh: "笔的寿命几乎全在芯上, 笔杆却几乎不会坏: 扔掉一支写完的笔, 扔掉的其实是一支还好好的笔杆。换芯的笔越用越顺手, 整笔越买越像在反复买同一个壳——文具的钱, 花在墨水上才算花在字上。",
      en: "A pen's life lives almost entirely in its refill, while the barrel barely ever fails: tossing a finished pen is tossing a perfectly good barrel. Refilled pens grow more familiar in the hand; buying whole new ones is rebuying the same shell — stationery money counts as writing money only when it buys ink.",
    },
    options: {
      zh: ["常用水性笔买替换芯", "留好笔杆只补墨", "一打廉价笔换一两支好笔"],
      en: ["Buy refills for the pens you actually use", "Keep the barrels, restock ink only", "Trade a dozen disposables for one or two good pens"],
    },
    reuseChannel: {
      zh: "先把家里的「笔冢」清一遍: 抽屉深处那堆笔, 多数只是芯写完了, 杆还健在——按型号补一包芯, 一口气复活大半。往后买笔认准可换芯的经典款, 芯便宜量大; 用完的空杆别扔, 有些牌子的芯通用。",
      en: "First audit the household pen graveyard: most of that drawer-deep pile is just out of ink, barrels perfectly healthy — one pack of matching refills resurrects the majority at once. Going forward, choose refillable classics and buy ink in packs; don't bin empties, plenty of brands share refill sizes.",
    },
    alternative: {
      zh: "下次补笔先做换算: 一支整笔的价钱约等于好几根原装芯, 而写出来的字数一样多——换芯摊到每万字的成本, 比反复买整笔低得多, 笔袋还清爽。廉价一打笔的手感损耗, 也是隐形成本。",
      en: "Do the conversion before the next pen run: one whole pen costs about as much as several original refills, yet writes the same number of words — per ten-thousand characters, refilling lands far below rebuying, with a tidier pencil case. The feel lost to flimsy dozen-packs is a hidden cost too.",
    },
    reuse: {
      zh: "一支用了多年、换过许多次芯的笔会变成「你的笔」: 重量、配重、笔尖的脾气都熟了——考场上它比任何新笔都可靠, 这是时间送的手感。",
      en: "A pen that's served years and many refills becomes your pen: its weight, balance and nib temperament all familiar — in an exam room it outperforms anything new, a feel only time gives.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "notebook_reuse",
    triggers: {
      zh: ["活页本", "新的本子", "买本子", "活页内芯"],
      en: ["new notebook", "buy notebooks", "buy a notebook", "loose-leaf paper"],
    },
    why: {
      zh: "买新本子之前, 家里大概率已经有一摞「余页本」: 每本用了三分之一就翻篇的, 加起来能凑出好几本整的。活页本是这套数学的满分答案——壳留着, 只换内芯; 定页本的宿命, 是最后一页永远写不到。",
      en: "Before a new notebook, the household likely holds a stack of partially-filled ones: each abandoned a third of the way in, together adding up to several whole notebooks. Loose-leaf is this math's perfect answer — keep the cover, swap the inserts; a bound notebook's fate is a final page never reached.",
    },
    options: {
      zh: ["清点家里的余页本先用", "活页本只换内芯", "旧本子的空白页撕下做草稿"],
      en: ["Inventory and finish partially-used notebooks first", "Refill loose-leaf inserts only", "Tear blank pages from old ones for scratch paper"],
    },
    reuseChannel: {
      zh: "做个「余页清点」: 把所有写到一半的本子集中一处, 最厚的先消化——课堂笔记、草稿、清单都往里写, 一两个月就能清空一本。活页用户更简单, 壳用顺手了就不再买壳, 只补内芯; 写过的内芯拆下归档, 壳立刻回到满血。",
      en: "Run a leftover-pages inventory: gather every half-written notebook in one place and digest the thickest first — lecture notes, drafts, lists all go in, and one empties within a month or two. Loose-leaf users have it simpler: once the cover suits your hand you stop buying covers, restocking inserts only; filed pages pop out, and the cover returns to full health instantly.",
    },
    alternative: {
      zh: "买本子前先翻一遍现有的: 大多数「需要新本子」的时刻, 其实是「需要一页空纸」——余页本能满足的部分不用花新的钱。真要买, 活页本配一包内芯是长期最省的组合, 每一页都用得上, 没有为空白纸柜付过一分钱。",
      en: "Flip through what you own before buying: most moments of needing a new notebook are really needing a blank page — the part your half-filled ones cover costs nothing new. When you do buy, a loose-leaf cover plus a pack of inserts is the long-run cheapest combo: every page gets used, and no cent ever went to storing blank paper.",
    },
    reuse: {
      zh: "把余页本写满是一种很踏实的小成就: 那一摞「用到最后一页」的本子, 比崭新的空白本更像认真生活过的证据——字迹从第一页到最后一页, 连成一段时间。",
      en: "Finishing a notebook to its last page is a quietly satisfying feat: a stack of used-to-the-end volumes is better evidence of a life attentively lived than any pristine blank one — handwriting from first page to final forms one continuous stretch of time.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "printer_borrow",
    triggers: {
      zh: ["打印机", "家用打印机", "买打印机"],
      en: ["printer", "home printer", "buy a printer"],
    },
    why: {
      zh: "家用打印机是「为了几次打印买一台机器」的经典冲动的典型: 一年打不了几回, 机器却在角落里吃灰、堵头、过期。打印这件事, 楼下打印店、公司前台、图书馆都能顺手解决——设备的最大浪费, 是闲置本身。",
      en: "The home printer is the classic impulse of buying a machine for a handful of jobs: a few prints a year, while the unit gathers dust, clogs and expires in the corner. Printing itself is solved in passing — the shop downstairs, the office front desk, the library — and a device's biggest waste is its own idleness.",
    },
    options: {
      zh: ["楼下打印店/图文店按张打", "公司/学校打印额度用起来", "真要高频再考虑入手"],
      en: ["Print by the sheet at a local print shop", "Use office or school printing quota", "Only consider buying if you'll print weekly"],
    },
    reuseChannel: {
      zh: "先数一数去年实际打了几次: 大多数家庭一只手数得完。按张付费的单价看着贵, 摊上机器钱、墨盒钱和堵头报废的风险, 几乎每次都更便宜——真有集中打印需求, 图书馆和社区服务中心的价格也亲民。",
      en: "Count last year's actual print jobs first: most households need one hand. The per-sheet price looks steep, but amortized against the machine, the cartridges and the risk of a clogged dead unit, it comes out cheaper nearly every time — and for batch jobs, library and community-center pricing stays friendly.",
    },
    alternative: {
      zh: "下单打印机之前先做除法: 机器价加首套墨盒, 除以你一年的打印次数——单次成本常常高过打印店一整摞的价钱, 还没算放它的那块地方。等打印真的变高频了再买, 那时它才从闲置品变成工具。",
      en: "Do the division before ordering: machine plus first cartridge set, divided by your annual print count — the per-job cost often exceeds a whole stack at the print shop, before counting the counter space it occupies. Buy when printing truly turns frequent; only then does it stop being idle inventory and start being a tool.",
    },
    reuse: {
      zh: "不持有打印机的生活方式自带轻盈: 没有耗材囤货、没有堵头焦虑、没有占地的方盒子——需要时走两步就有的服务, 比家里常年待机的机器更可靠。",
      en: "Living printer-free carries its own lightness: no consumable stockpile, no clog anxiety, no bulky box claiming a corner — a service two minutes' walk away, needed exactly when needed, beats a machine on permanent standby.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "back_to_school_cooldown",
    triggers: {
      zh: ["开学季", "返校季", "开学囤货"],
      en: ["back to school", "school supplies haul", "school shopping"],
    },
    why: {
      zh: "开学季促销最擅长的包装是「整套买齐」: 文具礼包、宿舍套装、清单式满减——买的不是需求, 是「新学期新气象」的仪式感。气象不该靠购物车给: 真正要用的东西, 开学两周内自然浮出清单。",
      en: "Back-to-school sales excel at one packaging trick: buy the whole bundle — stationery kits, dorm sets, checklist discounts — selling not needs but the ritual of a fresh start. A fresh start was never cart-shaped: what you'll actually use reveals itself on its own within the first two weeks.",
    },
    options: {
      zh: ["先列清单再逛促销", "开学前两周按实际缺口补", "耐用品用上届的继续"],
      en: ["Make the list before browsing sales", "Fill real gaps in the first two weeks", "Let last term's durables carry on"],
    },
    reuseChannel: {
      zh: "促销捆绑的数学要倒着算: 礼包价除以你真会用的那几件, 单价常比单买还贵——为凑满减加进来的, 都是提前付钱的闲置。先盘点存货再列缺口清单, 等开学用过两周再补齐, 清单会短得让你惊讶。",
      en: "Run the bundle math backwards: the kit price divided by the items you'll genuinely use often beats à-la-carte on per-item cost — whatever was added to clear the discount threshold is idle inventory paid for in advance. Inventory your stock, list the gaps, then refill after two weeks of actual use; the list will be embarrassingly short.",
    },
    alternative: {
      zh: "开学置办给自己一个冷静期: 清单列好, 放几天, 开学后按实际缺口下单——促销季每年都有, 错过这一轮的价格不构成损失; 而囤过头的那袋文具, 大概率原封不动地出现在明年夏天的闲置群里。",
      en: "Give the school run a cooldown: finish the list, let it sit a few days, then order against real gaps once term starts — the sale returns every year, and missing this round's price costs nothing; the overstocked pouch, meanwhile, resurfaces intact in next summer's secondhand groups.",
    },
    reuse: {
      zh: "「按缺口买」的开学是更从容的开学: 书包里每样东西都有来处和用途, 没有为满减凑数的累赘——学期末收拾时, 你会感谢当初那份短清单。",
      en: "A gap-driven school run is a calmer one: everything in the bag has a reason and a job, no filler bought to clear a threshold — come end-of-term cleanup, you'll thank that short list.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "office_stationery_stock",
    triggers: {
      zh: ["办公用品", "办公用品库存", "笔和本子库存"],
      en: ["buy stationery", "office supplies", "stock up on office supplies", "stationery supplies", "office supplies before the quarter"],
    },
    why: {
      zh: "文具是「顺手补一点」积累最快的品类: 抽屉里总有笔, 但促销一到又想囤。先清点存货, 只买会写完的那几件。",
      en: "Stationery piles up through casual top-ups: a drawer already holds pens, yet every sale tempts another stockpile. Inventory first, then buy only what you'll finish writing.",
    },
    options: {
      zh: ["抽屉盘点后再列清单", "常买型号记一页", "团队拼单按需补"],
      en: ["Inventory the drawer before listing", "Keep one page of regular models", "Split team orders by real needs"],
    },
    reuseChannel: {
      zh: "公司行政常有多余文具可领, 家里和工位也大概率散落着可用库存。真正高频的笔和本, 买好一点的替换芯或内芯比整盒囤新品更省。",
      en: "Office admin often holds spare supplies, while home and desk hide usable stock. For frequently used pens and notebooks, quality refills and inserts beat boxes of new stock.",
    },
    alternative: {
      zh: "先做「余量盘点」: 笔、本、便签分别数一数, 够用三个月就不进购物车。要补时按型号单补, 不为凑单加库存。",
      en: "Run a stock count first: pens, notebooks and notes each tallied, and three months' supply stays out of the cart. Refill by model when needed rather than adding stock to clear a threshold.",
    },
    reuse: {
      zh: "把现有文具写完是一种很轻的成就感。常用物保持在少数几件, 找得到、用得完, 桌面也更清爽。",
      en: "Finishing current stationery is a quietly satisfying feat. Keep favorites few enough to find and finish, and the desk stays clearer too.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "office_printer_supplies",
    triggers: {
      zh: ["硒鼓", "打印纸囤", "复印纸", "没墨了", "硒鼓快没了", "耗材怎么选", "机耗材怎么选", "墨盒型号"],
      en: ["toner cartridge", "ink is running low", "ink is almost gone", "the toner cartridge"],
    },
    why: {
      zh: "耗材常在「怕突然没」时被囤下, 但机器型号一换, 库存就变成沉没成本。先确认打印频率和型号稳定性, 再决定备多少。",
      en: "Supplies get stocked against a sudden empty, yet one printer change turns inventory into sunk cost. Confirm print frequency and model stability before deciding how much to keep.",
    },
    options: {
      zh: ["按季度真实用量备货", "查通用耗材兼容性", "低频打印改按张付费"],
      en: ["Stock by a quarter's real usage", "Check compatible generic supplies", "Pay per sheet for low-frequency printing"],
    },
    reuseChannel: {
      zh: "公司或学校的打印额度先核一遍, 低频需求外部按张打印更合算。真要买耗材, 通用兼容款和回收再制造款通常价格更友好。",
      en: "Check office or school printing quota first; per-sheet external printing suits low-frequency jobs. When supplies truly make sense, compatible generics and remanufactured cartridges usually price friendlier.",
    },
    alternative: {
      zh: "先看最近几次打印的真实间隔: 一个月几次以内, 备一件就够; 高频再谈通用耗材和回收计划。别让「怕没」替使用频率做决定。",
      en: "Review the real gap between recent print jobs: at a few per month, one spare is enough; frequent use justifies generics and recycling programs. Don't let fear of empty decide for your frequency.",
    },
    reuse: {
      zh: "只保留一件备用耗材, 找起来简单也不怕闲置。旧耗材按当地回收渠道处理, 抽屉和空气都会更轻。",
      en: "Keep one spare supply at most — simple to find and never idle. Send spent cartridges through local recycling and both drawer and air stay lighter.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "office_furniture_upgrade",
    triggers: {
      zh: ["换办公椅", "升降桌", "人体工学椅", "办公桌升级", "电脑支架", "换个椅子", "椅子升级"],
      en: ["upgrade office chair", "standing desk", "ergonomic chair", "new desk", "monitor stand", "my back hurts"],
    },
    why: {
      zh: "办公家具的升级常从腰酸开始, 但问题也可能来自椅子高度、屏幕位置或久坐节奏。先调现有设备, 花小钱解决再上大件。",
      en: "Desk upgrades often begin with an aching back, though chair height, screen position or movement rhythm may hold the fix. Adjust current equipment first, solve cheaply, then buy large.",
    },
    options: {
      zh: ["先调桌椅和屏幕高度", "垫高/支架先试姿势", "二手收九成新大件"],
      en: ["Adjust chair, desk and screen height first", "Trial posture with risers or stands", "Buy near-mint secondhand pieces"],
    },
    reuseChannel: {
      zh: "公司搬迁和远程办公调整时, 二手平台常有成色很好的人体工学椅和升降桌。先试坐试高, 再决定型号, 避免买回不合适的大件。",
      en: "Office moves and remote-work resets fill resale platforms with well-kept ergonomic chairs and standing desks. Trial the fit and height before choosing a model so an unsuitable giant never lands home.",
    },
    alternative: {
      zh: "把升级拆成姿势、支撑、耐久三步: 先免费调姿势, 再用小配件补支撑, 确认每天真的久坐后再投资耐用品。合适比高级更重要。",
      en: "Split the upgrade into posture, support and durability: adjust posture free, add support through small accessories, then invest in durable pieces after daily sitting is confirmed. Fit outranks premium.",
    },
    reuse: {
      zh: "一台调对了高度的桌椅组合, 会默默减少每天的负担。先把现有设备用到位, 再让新家具补足缺口。",
      en: "A correctly adjusted desk-and-chair pair quietly lifts the daily load. Let current equipment work fully before new furniture fills the remaining gap.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "office_event_supplies",
    triggers: {
      zh: ["会议物料", "公司活动奖品", "员工福利礼品", "企业团购礼品", "年会奖品", "奖品开始采购", "司活动奖品"],
      en: ["conference supplies", "corporate event swag", "employee gifts", "bulk conference gifts", "meeting giveaways"],
    },
    why: {
      zh: "会议物料最容易在最后一刻凑数: 包装、赠品、横幅都赶着下单。先问参与人数和复用计划, 再决定采购清单。",
      en: "Event supplies get rushed into carts at the last minute: packaging, favors and banners ordered in a panic. Ask attendance and reuse plans first, then set the purchase list.",
    },
    options: {
      zh: ["物料按人数加少量余量", "通用设计跨活动复用", "体验/服务替代实物"],
      en: ["Order by headcount plus a small buffer", "Reuse generic designs across events", "Offer experiences or services instead of goods"],
    },
    reuseChannel: {
      zh: "横幅、展架、礼品袋做去日期化设计, 下一场还能接着用。公司内部先问一遍闲置物料库存, 常常已经足够起办。",
      en: "Date-free banners, stands and gift bags carry straight into the next event. Ask internal idle-stock first; existing materials often launch the event already.",
    },
    alternative: {
      zh: "奖品和伴手礼先问「会后会不会被留下」: 实用、轻量、可自选的组合比大件更受欢迎。数量按出席率算, 不按最满想象算。",
      en: "Ask whether prizes and favors survive the event: practical, light, choosable combos outperform bulky ones. Count by likely attendance, not the fullest imagination.",
    },
    reuse: {
      zh: "一套中性设计的可复用物料, 每办一次活动就更划算一次。少定制、多流转, 仓库也少一堆带日期的旧物。",
      en: "A neutral reusable kit gets cheaper with every event. Less customizing and more circulating also spare the storeroom a pile of dated leftovers.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
];
