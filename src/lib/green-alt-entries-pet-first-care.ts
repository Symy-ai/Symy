/**
 * green-alt-entries-pet-first-care — 第一次养宠物词条 (zh+en 双语)
 *
 * 词条结构见 green-alt-types.ts。本域只接住新手/刚接回家/囤积式表达；
 * 医疗、粮食比较、行为训练等成熟养宠问题不在此拦截。
 */

import type { GreenAlternativeEntry } from './green-alt-types';

export const GREEN_ALT_ENTRIES_PET_FIRST_CARE: readonly GreenAlternativeEntry[] = [
  {
    id: "pet_food_starter_small",
    triggers: {
      zh: ["第一次养猫要买什么粮", "第一次养狗要买什么粮", "第一次买猫粮先买小包", "第一次买狗粮先买小包", "幼猫粮囤", "幼犬粮囤"],
      en: ["first time cat owner food", "first time dog owner food", "new kitten food", "new puppy food", "stocking up on kitten food", "stocking up on puppy food"],
    },
    why: {
      zh: "第一次迎接宠物时，食量和口味都还没摸清；先买小包装能让换粮节奏跟着宠物的真实胃口走，也减少开封后放久不用的情况。",
      en: "With a first pet, appetite and preferences are still unknown; a small bag keeps refills matched to real consumption and reduces opened food left unused.",
    },
    options: {
      zh: ["先买一至两周的小包装", "记录每天的进食量再补货", "换粮前先准备过渡期方案"],
      en: ["Start with a small bag for the first weeks", "Track daily portions before refilling", "Plan a gradual transition before switching"],
    },
    reuseChannel: {
      zh: "接宠物前先向救助方、寄养家庭或兽医确认当前粮食；邻里养宠群常有拆分的试用装和小袋转让，适合第一轮尝试。",
      en: "Before pickup, ask the rescue, foster home, or veterinarian about the current food; local pet-owner groups often share starter portions and small bags for a first trial.",
    },
    alternative: {
      zh: "第一次买粮，先把克制当成照顾的一部分：小包装够吃到观察期结束，再根据食量和接受度补下一包。",
      en: "For the first food purchase, let restraint be part of care: a small bag covers the observation window, then you refill based on appetite and acceptance.",
    },
    reuse: {
      zh: "先确认宠物正在吃的粮，并保留原包装信息；第一包只需覆盖适应期，不必提前占满储粮桶。",
      en: "Confirm what your pet currently eats and keep the original bag details; the first pack only needs to cover the settling-in period.",
    },
    savingsHint: {
      zh: "少一次整袋试错，就少一份开封后闲置的粮食，也省下相当于 {hours} 的重复购买时间。",
      en: "Skipping one full-bag trial leaves less opened food unused and saves about {hours} of rebuying time.",
    },
  },
  {
    id: "pet_treat_one_kind",
    triggers: {
      zh: ["新手宠物零食", "第一次买猫零食", "第一次买狗零食", "猫咪零食先买十种", "狗狗零食买一堆", "幼猫零食囤"],
      en: ["first cat treats", "first dog treats", "new pet treats", "stock up on pet treats", "try ten cat treats", "buy lots of cat treats"],
    },
    why: {
      zh: "零食的意义是奖励和沟通，不是货架展览；第一次先选一种，更容易观察接受度，也避免一堆口味被遗忘在柜子里。",
      en: "Treats reward and communicate; they do not need a whole shelf. One kind at first makes acceptance easier to observe and prevents forgotten flavors piling up.",
    },
    options: {
      zh: ["先选一种常用奖励零食", "把零食纳入每日喂食计划", "确认接受后再尝试第二种"],
      en: ["Choose one everyday reward treat", "Count treats within the daily feeding plan", "Try a second kind only after acceptance"],
    },
    reuseChannel: {
      zh: "向救助方或卖家要少量当前奖励物；社区养宠群也常有小包装交换，适合先建立同一种奖励信号。",
      en: "Ask the rescue or seller for a little of the current reward; community pet groups often swap small packs for building one consistent reward cue.",
    },
    alternative: {
      zh: "先一种零食、一个口令、一个奖励节奏；这比一次买十种更能让新手期的沟通变简单。",
      en: "Start with one treat, one cue, and one reward rhythm; it keeps first-week communication simpler than ten varieties at once.",
    },
    reuse: {
      zh: "把开封日期写在包装上，并放在日常喂食位置旁边；一种用完前不添新的。",
      en: "Write the opening date on the pack and keep it beside daily feeding supplies; finish one before adding another.",
    },
    savingsHint: {
      zh: "少买几种不合适的零食，就少几次开封后吃不完，也少花相当于 {hours} 的挑选时间。",
      en: "Fewer unsuitable treat varieties mean fewer opened packs left unfinished and about {hours} less choice-making time.",
    },
  },
  {
    id: "pet_supply_reuse_borrow",
    triggers: {
      zh: ["第一次养宠物用品", "刚接猫回家先囤点东西", "刚接小狗回家先囤点东西", "新手养猫清单买齐", "新手养狗清单买齐", "第一次养宠物一次买齐"],
      en: ["first time cat owner shopping list", "first time dog owner shopping list", "stock up on puppy supplies", "stock up on kitten supplies", "new pet starter supplies", "buy everything for a new pet"],
    },
    why: {
      zh: "新手清单容易被兴奋放大；先备真正高频的几件，再按宠物习惯补齐，能减少不适合家里的用品闲置。",
      en: "Beginner lists often grow with excitement; starting with only high-frequency essentials reduces supplies that do not fit the pet or home.",
    },
    options: {
      zh: ["先列必需品，再标出可借可缓的物品", "向有经验的养宠朋友核对清单", "观察一周后补第二件同类用品"],
      en: ["List essentials first, then mark borrowable or delayed items", "Ask experienced pet owners to review the list", "Wait a week before adding a similar item"],
    },
    reuseChannel: {
      zh: "闲鱼和本地养宠群常有猫砂盆、航空箱、围栏、水盆等闲置转让；亲友短期寄养用品也可先借用。",
      en: "Community groups and secondhand listings often carry litter boxes, carriers, gates, and bowls; friends may also lend supplies for the first weeks.",
    },
    alternative: {
      zh: "第一次不需要一次买齐。先给宠物一个稳定的小角落，观察它的动线，再让用品按需到场。",
      en: "A first day does not require everything at once; set up one stable corner, observe your pet's movement, then add items as needed.",
    },
    reuse: {
      zh: "家里现有低边盆、旧毯子、收纳箱可以先承担过渡角色；确认宠物使用习惯后再升级。",
      en: "A low-sided bowl, old blanket, or storage box can cover the transition; upgrade after the pet's habits are clear.",
    },
    savingsHint: {
      zh: "少添一件闲置宠物用品，就多一次家用物品复用，也省下相当于 {hours} 的整理时间。",
      en: "Each idle pet item avoided creates one more household reuse and saves about {hours} of organizing time.",
    },
  },
  {
    id: "pet_cleaning_refill_first",
    triggers: {
      zh: ["新手宠物清洁用品", "第一次养猫清洁", "第一次养狗清洁", "宠物湿巾囤", "除味剂囤一大箱", "宠物尿垫囤一大箱"],
      en: ["first pet cleaning supplies", "new kitten cleaning supplies", "new puppy cleaning supplies", "stock up on pet wipes", "bulk pet odor spray", "bulk puppy pads"],
    },
    why: {
      zh: "清洁节奏要等宠物回家后才会显形；先买小容量补充装，能跟着实际 mess 频率调整，避免一次囤太多用不完。",
      en: "Cleaning cadence only becomes clear after arrival; small refills can follow the real mess frequency instead of leaving a large stock unused.",
    },
    options: {
      zh: ["先买小包或补充装", "用可洗抹布承接日常清洁", "确认频率后再按周期补货"],
      en: ["Buy a small pack or refill first", "Use washable cloths for daily cleanup", "Refill on a set cadence after usage is clear"],
    },
    reuseChannel: {
      zh: "旧 T 恤、毛巾和可洗抹布可以处理日常爪子和水渍；社区团购可等确认品牌后再拆分补充装。",
      en: "Old shirts, towels, and washable cloths can handle paws and spills; join a group refill only after the product suits your routine.",
    },
    alternative: {
      zh: "清洁品先小瓶试用，把囤货节奏交给真实生活；能洗的用品先上，一次性用品只做补充。",
      en: "Trial cleaning products in small bottles and let real routines set the schedule; washable tools first, disposables only as backup.",
    },
    reuse: {
      zh: "准备一个可洗清洁布区，按污染程度分开使用；补充装用完前不重复开封。",
      en: "Set up washable cloths separated by mess level; do not open a new refill before the current one is finished.",
    },
    savingsHint: {
      zh: "少囤一箱一次性清洁品，就少一段等待用完的时间，也省下相当于 {hours} 的收储精力。",
      en: "One fewer bulk box of disposables means less waiting to use it up and about {hours} of storage effort saved.",
    },
  },
  {
    id: "pet_toy_single_start",
    triggers: {
      zh: ["新手宠物玩具", "第一次买猫玩具", "第一次买狗玩具", "第一次养宠物玩具买一堆", "第一次养猫咪玩具先买一件", "第一次养狗狗玩具先买一件"],
      en: ["new kitten toys", "new puppy toys", "first pet toy", "first cat toys buy lots", "first dog toys buy lots", "full set of puppy toys first"],
    },
    why: {
      zh: "玩具偏好很个体：有的追球，有的只认纸箱。先一件一件试，能更快找到真正会玩的，也减少玩具箱变闲置箱。",
      en: "Play preferences are individual: some chase balls, some claim the box. Trying one at a time finds real favorites and keeps the toy bin from idling.",
    },
    options: {
      zh: ["先选一件基础互动玩具", "用纸箱、纸团做免费试探", "确认偏好后再添耐用品"],
      en: ["Choose one basic interactive toy", "Test interest with a box or paper ball", "Add durable items after preferences are clear"],
    },
    reuseChannel: {
      zh: "本地养宠群常转让几乎全新的玩具；轮换借用也能观察偏好，入手前先确认材质可清洁。",
      en: "Local pet groups often list nearly new toys; rotating borrowed toys reveals preferences, and cleanable materials matter before keeping any.",
    },
    alternative: {
      zh: "先买一件会陪你和它一起玩的玩具；互动本身比满屋玩具更能建立安全感。",
      en: "Buy one toy you can enjoy together first; the interaction builds security better than a room full of toys.",
    },
    reuse: {
      zh: "用纸团、旧毛毯结绳先试兴趣；新玩具轮换收纳，旧件未失去兴趣前不补新件。",
      en: "Try paper balls or an old blanket knot first; rotate toys in storage and do not add new ones while interest remains.",
    },
    savingsHint: {
      zh: "少收一件不玩的玩具，就少一次“可爱但闲置”，也省下相当于 {hours} 的挑选时间。",
      en: "One less ignored toy means one fewer cute-but-idle item and about {hours} less shopping time.",
    },
  },
  {
    id: "pet_allergy_small_pack",
    triggers: {
      zh: ["宠物过敏粮大包装", "猫过敏粮大包装", "狗过敏粮大包装", "低敏粮囤大袋", "宠物食物过敏买粮", "水解粮囤大袋"],
      en: ["cat allergy food bulk", "dog allergy food bulk", "hypoallergenic pet food big bag", "pet food allergy shopping", "hydrolyzed pet food bulk", "trial hypoallergenic dog food bag"],
    },
    why: {
      zh: "疑似食物不耐受或过敏时，大包装会把试错周期拉长；先小包装确认接受度和反应，更适合刚开始的观察期。",
      en: "With suspected food intolerance or allergy, a large pack stretches the trial period; a small pack first fits the initial observation window.",
    },
    options: {
      zh: ["先向兽医确认排查思路", "按兽医建议选小包装试验粮", "记录症状变化和进食反应"],
      en: ["Ask a veterinarian to guide the plan", "Use a small trial pack as advised", "Log symptoms and eating responses"],
    },
    reuseChannel: {
      zh: "动物医院和救助方可能有试用装或开封前确认渠道；不要在未经兽医确认前购买大包装特殊粮。",
      en: "Veterinary clinics and rescues may have trial packs or pre-purchase confirmation options; avoid large special-diet bags before veterinary advice.",
    },
    alternative: {
      zh: "过敏问题先交给专业兽医；若需要更换食物，从最小可试用包装开始，确认稳定后再谈周期补货。",
      en: "Let a veterinarian lead allergy care; if a diet change is advised, start with the smallest trial size and establish a refill cadence only after stability.",
    },
    reuse: {
      zh: "保留当前粮配方、症状记录和兽医建议；新粮与旧粮分开存放，按过渡表使用，避免重复开封。",
      en: "Keep the current formula, symptom notes, and veterinary advice; store new and old food separately and follow the transition schedule without duplicate opened packs.",
    },
    savingsHint: {
      zh: "少一次大包装特殊粮试错，就少一份不适合继续吃的余量，也省下相当于 {hours} 的等待消耗时间。",
      en: "Avoiding one bulk special-diet trial leaves less unsuitable food to finish and saves about {hours} of slow use-up time.",
    },
  },
];
