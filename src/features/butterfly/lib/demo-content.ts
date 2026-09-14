/**
 * 蝴蝶效应演示内容 — 无需 LLM 的预置故事
 *
 * 当 Letta Agent 不可用时，使用这些预置内容提供完整的蝴蝶效应体验。
 * 每个决策类型（bought/resisted）都有 5 个章节的完整故事。
 *
 * 关键设计：
 * - 仍然是蝴蝶效应：小事不必然导致大事，好坏反转要自然
 * - 情感真实：第二人称叙述，感官细节
 * - 插图使用预生成的 AI 图片 CDN URL（无需实时生成，即时显示）
 */

import type { DecisionType, StoryOutline } from "../types";

export type DemoLocale = "en" | "zh";

// ============================================================
// 预置 AI 插图 URL（已预生成，无需实时调用 API）
// 按 chapterIndex → sceneIndex 映射，每场景 1 张图
// ============================================================

export const DEMO_ILLUSTRATION_URLS: Record<number, string[]> = {
  // Chapter 1 — "The Moment of Decision" — neutral tone
  1: [
    "https://pro.filesystem.site/cdn/20260605/a8fb7f779dcc47958bc34a6175ab5916.png",
    "https://pro.filesystem.site/cdn/20260605/a221e79c2ef3465a89afff7887d7548c.png",
    "https://pro.filesystem.site/cdn/20260605/734aef7c4d9e4b39a519072b985b8fe3.png",
  ],
  // Chapter 2 — "The First Ripple" — twist tone
  2: [
    "https://pro.filesystem.site/cdn/20260605/2c4e2aef3a774ae392b8b3aa1ec93e50.png",
    "https://pro.filesystem.site/cdn/20260605/57ead1878ca644d8b3a61a80b84e6bcb.png",
    "https://pro.filesystem.site/cdn/20260605/5b9d6837e3e24181a8929f6bb4cff50b.png",
  ],
  // Chapter 3 — "The Turning Point" — dark tone
  3: [
    "https://pro.filesystem.site/cdn/20260605/06a94f1afef34ccc9b515a53c39dfbd4.png",
    "https://pro.filesystem.site/cdn/20260605/9d17eb2a7e8c4e4aaa0a715994689bf7.png",
    "https://pro.filesystem.site/cdn/20260605/83910393c17d465ba6f461838c05408c.png",
  ],
  // Chapter 4 — "Echoes and Shadows" — neutral tone
  4: [
    "https://pro.filesystem.site/cdn/20260605/9ad2f4ef3ba6421e9972828d328481bb.png",
    "https://pro.filesystem.site/cdn/20260605/cf5dc1b77a874cd78f1a5cde76ffeb21.png",
    "https://pro.filesystem.site/cdn/20260605/fdf0d82f8f2b47d1b9fa282a9d87fec0.png",
  ],
  // Chapter 5 — "Where the Ripples End" — twist tone
  5: [
    "https://pro.filesystem.site/cdn/20260605/b5dc29fe293846ba8dabfbeacd82ea97.png",
    "https://pro.filesystem.site/cdn/20260605/2fe35a1203cc40df9f633e798a9fd87e.png",
    "https://pro.filesystem.site/cdn/20260605/1bec85b9dcbe417ba39934013d5f7185.png",
  ],
};

/** 章节封面图 — 使用该章节第 1 张场景图 */
export function getDemoChapterIllustrationUrl(chapterIndex: number): string {
  return (
    DEMO_ILLUSTRATION_URLS[chapterIndex]?.[0] || DEMO_ILLUSTRATION_URLS[1][0]
  );
}

/** 场景插图 — 返回 string[]（每场景 1 张图） */
export function getDemoSceneIllustrations(
  chapterIndex: number,
): Record<number, string[]> {
  const urls = DEMO_ILLUSTRATION_URLS[chapterIndex];
  if (!urls) return {};
  const result: Record<number, string[]> = {};
  urls.forEach((url, idx) => {
    result[idx] = [url];
  });
  return result;
}

// ============================================================
// 大纲生成 — 双语表驱动，locale 缺省保持既有英文调用兼容
// ============================================================

export function generateDemoOutline(
  decisionType: DecisionType,
  decisionDescription: string,
  locale: DemoLocale = "en",
): StoryOutline {
  const isBought = decisionType === "bought";
  const outlineCopy = {
    en: {
      titles: [
        "The Moment of Decision",
        "The First Ripple",
        "Where the Ripples End",
      ],
      firstSummary: `The moment you ${isBought ? "bought" : "walked away from"} "${decisionDescription}" — a small choice, and the first ripple is already crossing the room.`,
      secondSummary: isBought
        ? `The new thing finds its place. Slowly, gently, it begins to shape what happens next.`
        : `The space you protected stays quiet. Something else moves into it — kinder than expected.`,
      thirdSummary:
        "The ripple lands somewhere surprising. Not huge, not fated — just a warm little turn you did not see coming.",
      timeSpans: ["that evening", "the next morning", "the following dawn"],
      endingHint:
        "The ending is gentler than expected — and something good stays.",
    },
    zh: {
      titles: ["决定的那一刻", "第一圈涟漪", "涟漪停下的地方"],
      firstSummary: `你${isBought ? "买下了" : "放下了"}「${decisionDescription}」。选择很小，涟漪却已经开始悄悄往外走。`,
      secondSummary: isBought
        ? `新东西慢慢找到自己的位置，也轻轻改变着接下来的一天。`
        : `你守住的那点空间很安静。有另一样更温柔的东西，正慢慢走进来。`,
      thirdSummary:
        "涟漪落在有点意外的地方。不夸张，也不注定，只是一次温暖的小转弯。",
      timeSpans: ["那个晚上", "第二天早晨", "再一个清晨"],
      endingHint: "结尾比想象中温柔——有什么好东西留下来了。",
    },
  }[locale];

  return {
    version: 1,
    decisionType,
    decisionDescription,
    chapters: [
      {
        index: 1,
        title: outlineCopy.titles[0],
        summary: outlineCopy.firstSummary,
        hasChoice: false,
        tone: "neutral",
        timeSpan: "that evening",
      },
      {
        index: 2,
        title: outlineCopy.titles[1],
        summary: outlineCopy.secondSummary,
        hasChoice: true,
        tone: "twist",
        timeSpan: "the next morning",
      },
      {
        index: 3,
        title: outlineCopy.titles[2],
        summary: outlineCopy.thirdSummary,
        hasChoice: false,
        tone: "twist",
        timeSpan: "the following dawn",
      },
    ],
    endingHint: outlineCopy.endingHint,
  };
}

// ============================================================
// 章节内容生成
// ============================================================

export function generateDemoChapterContent(
  chapterIndex: number,
  decisionType: DecisionType,
  decisionDescription: string,
  selectedChoices: Record<number, string>,
  locale: DemoLocale = "en",
): string {
  const isBought = decisionType === "bought";
  const item = decisionDescription;

  const copy = {
    en: {
      1: `The ${isBought ? "order confirmation" : "empty cart"} glows softly on the screen. You ${isBought ? "bought" : "walked away from"} "${item}" ${isBought ? "just now" : "a moment ago"}.|||${isBought ? `The ${item} is yours. You turn it over once, feeling the small promise of something useful — or something bright.` : `The tab closes. "${item}" becomes one of the things you admired, then let rest.`}|||Nothing loud happens. But a first ripple has already started moving, slow as moonlight on water.`,
      2: `Morning arrives with warm, ordinary sounds. You ${isBought ? `find the ${item} exactly where you left it` : `open your phone, and "${item}" is no longer waiting`}.|||${
        selectedChoices[2] === "A"
          ? `You chose to keep it close. The small commitment settles in like a favorite mug on a familiar shelf.`
          : selectedChoices[2] === "B"
            ? `You chose to loosen your grip. The room feels lighter, as if it had been waiting for you to exhale.`
            : `Life offers a playful little turn. You look back once — then notice today beginning.`
      }|||Someone makes you laugh. The laugh carries yesterday's choice into today, light as a paper boat on moving water.`,
      3: `Dawn touches the ${item}, the quiet room, and everything that came after — equally gently.|||${
        isBought
          ? `The ${item} stayed. It does not change the whole world; it simply becomes a good trace in yours — used, useful, remembered.`
          : `The ${item} did not come home. Its absence became a calmer evening, a promise kept, a small fund that finally felt full.`
      }|||Here is the twist: the ripple did not have to become enormous to matter. It only had to leave something warm behind. The butterfly lands, wings folded like a kept promise.`,
    },
    zh: {
      1: `屏幕上${isBought ? "的订单确认还亮着" : "的购物车已经空了"}。刚刚，你${isBought ? "买下了" : "放下了"}「${item}」。|||${isBought ? `它属于你了。你把它翻过来看了一眼，像看见一点小用场，或者一点小光。` : `页面关掉，「${item}」变成你欣赏过、又让它休息的东西。`}|||没有惊天动地的事发生。但第一圈涟漪已经动了，像月光落在水面那样慢。`,
      2: `早晨带着寻常又温暖的声音来了。你${isBought ? `一眼看见放在原处的「${item}」` : `打开手机，「${item}」已经不在那里等待`}。|||${
        selectedChoices[2] === "A"
          ? `你选择让它靠近一点。这个小小的确定，像常用杯子放回熟悉的架子上。`
          : selectedChoices[2] === "B"
            ? `你选择松开一点。房间轻了一些，好像它一直在等你呼出这口气。`
            : `生活来了个俏皮的小转弯。你回头看了一眼，然后看见今天开始了。`
      }|||有人把你逗笑了。笑声把昨天的选择带进今天，轻得像水面上的纸船。`,
      3: `晨光落在「${item}」上，落在安静的房间里，也落在后来发生的一切上。|||${
        isBought
          ? `「${item}」留下来了。它不需要改变整个世界；它只是在你生活里留下一个好痕迹——被使用，被需要，被记得。`
          : `「${item}」没有回家。它的离开，变成一个更安静的晚上、一个兑现的小承诺、一个终于攒满的小小基金。`
      }|||原来这就是反转：涟漪不必变成巨浪才算数。它只要留下一点温度就够了。蝴蝶落下来了，翅膀合着，像一个守住的小承诺。`,
    },
  }[locale];

  const chapters: Record<number, string> = {
    1: copy[1],
    2: copy[2],
    3: copy[3],
  };

  return chapters[chapterIndex] || chapters[1];
}

// ============================================================
// 选择内容生成
// ============================================================

export function generateDemoChoice(
  chapterIndex: number,
  decisionType: DecisionType,
  decisionDescription: string,
  locale: DemoLocale = "en",
): { prompt: string; options: { id: string; label: string; hint: string }[] } {
  const isBought = decisionType === "bought";
  if (chapterIndex !== 2) {
    return {
      prompt:
        locale === "zh"
          ? "你想走哪一条小路？"
          : "Which path would you like to take?",
      options: [
        {
          id: "A",
          label: locale === "zh" ? "熟悉的小路" : "The familiar path",
          hint:
            locale === "zh"
              ? "熟悉里也藏着一点小惊喜。"
              : "Familiar ground still hides a small surprise.",
        },
        {
          id: "B",
          label: locale === "zh" ? "陌生的小路" : "The curious path",
          hint:
            locale === "zh"
              ? "新地方可能有温柔的事。"
              : "New places can be kind to wanderers.",
        },
      ],
    };
  }

  const choiceCopy = {
    en: {
      prompt: isBought
        ? `"${decisionDescription}" is still here this morning. It has already nudged your routine. What should the little elephant guardian do?`
        : `A morning has passed since you walked away from "${decisionDescription}". What should the little elephant guardian keep with you?`,
      options: [
        {
          id: "A",
          label: "Keep it close",
          hint: "Let it become a steady, friendly part of the day.",
        },
        {
          id: "B",
          label: "Hold it lightly",
          hint: "Give it room to breathe, and let the day surprise you.",
        },
      ],
    },
    zh: {
      prompt: isBought
        ? `今天早上，「${decisionDescription}」还在。它已经轻轻改变了你的节奏。小象守护者该怎么做？`
        : `距离放下「${decisionDescription}」，一个早晨过去了。小象守护者要替你守住什么？`,
      options: [
        {
          id: "A",
          label: "让它靠近",
          hint: "让它变成一天里稳定又友善的一小块。",
        },
        {
          id: "B",
          label: "轻轻拿着",
          hint: "给它一点呼吸的空间，也让今天有机会出乎意料。",
        },
      ],
    },
  }[locale];

  return choiceCopy;
}

// ============================================================
// 蝴蝶效应总结
// ============================================================

export function generateDemoSummary(
  decisionType: DecisionType,
  decisionDescription: string,
  locale: DemoLocale = "en",
): string {
  if (decisionType === "bought") {
    return locale === "zh"
      ? `你买下了「${decisionDescription}」。世界没有在一夜之间翻转，但从那天起，生活里多了一件被认真使用的东西：它陪着你，帮你解决真需要，也留下一个好痕迹。蝴蝶效应不一定轰烈；有时候，它只是让温度留在了原来的地方。钱用对了地方。你也是。`
      : `You bought "${decisionDescription}" — and the world did not flip overnight. But from that day on, one useful thing stayed in your life: it kept you company, answered a real need, and left a warm trace behind. The butterfly effect does not have to be thunderous. Sometimes it simply lets warmth stay where you live. The money went somewhere good. So did you.`;
  }

  return locale === "zh"
    ? `你放下了「${decisionDescription}」。什么都没有消失。那个没花的选择，变成一个更平静的周晚、一个兑现的小承诺、一个终于攒满的小小基金。蝴蝶效应不在远处轰鸣；它在这里，安安静静地替你守住了生活。钱留下了。你也是。`
    : `You walked away from "${decisionDescription}" — and nothing was lost. The unspent choice became a calmer weeknight, a small promise kept, a little fund that finally felt full. The butterfly effect does not roar in the distance; it stays right here, quietly guarding your life. The money stayed. So did you.`;
}
