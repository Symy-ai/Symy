import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DEMO_ILLUSTRATION_URLS,
  generateDemoChapterContent,
  generateDemoChoice,
  generateDemoOutline,
  getDemoSceneIllustrations,
  generateDemoSummary,
} from "../demo-content";

const locales = ["en", "zh"] as const;
const decisions = ["bought", "resisted"] as const;

function allGeneratedText(
  decisionType: "bought" | "resisted",
  locale: "en" | "zh",
) {
  const description = "a warm yellow lamp";
  return [
    generateDemoOutline(decisionType, description, locale),
    generateDemoChapterContent(1, decisionType, description, {}, locale),
    generateDemoChapterContent(
      2,
      decisionType,
      description,
      { 2: "A" },
      locale,
    ),
    generateDemoChapterContent(
      3,
      decisionType,
      description,
      { 2: "B" },
      locale,
    ),
    generateDemoChoice(2, decisionType, description, locale),
    generateDemoSummary(decisionType, description, locale),
  ].map((value) => JSON.stringify(value));
}

describe("butterfly demo content guard", () => {
  it.each(locales)("keeps the guardian voice in %s output", (locale) => {
    decisions.forEach((decisionType) => {
      allGeneratedText(decisionType, locale).forEach((output) => {
        expect(output).not.toContain("terrifying");
        expect(output).not.toContain("Freedom has its own price");
        expect(output).not.toContain("The truth is never what you expect");
        expect(output).not.toContain("neither what you feared");
      });
    });
  });

  it("contains no dark voice anchors in source", () => {
    const source = readFileSync(
      new URL("../demo-content.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("terrifying");
    expect(source).not.toContain("Freedom has its own price");
    expect(source).not.toContain("The truth is never what you expect");
    expect(source).not.toContain("neither what you feared");
  });

  it.each(decisions)(
    "keeps a Chinese guardian echo for %s summaries",
    (decisionType) => {
      expect(generateDemoSummary(decisionType, "暖黄色的台灯", "zh")).toMatch(
        /留下|守住/,
      );
      expect(generateDemoSummary(decisionType, "暖黄色的台灯", "zh")).toMatch(
        /[\u4e00-\u9fff]/,
      );
    },
  );

  it.each(decisions)(
    "keeps an English guardian echo for %s summaries",
    (decisionType) => {
      expect(
        generateDemoSummary(decisionType, "a warm yellow lamp", "en"),
      ).toMatch(/stayed|kept|trace/i);
    },
  );

  it.each(locales)("preserves the story structure in %s", (locale) => {
    const outline = generateDemoOutline(
      "resisted",
      "a warm yellow lamp",
      locale,
    );
    expect(outline.chapters).toHaveLength(3);
    expect(outline.chapters.map((chapter) => chapter.index)).toEqual([1, 2, 3]);
    expect(outline.chapters[1].hasChoice).toBe(true);

    const choice = generateDemoChoice(
      2,
      "resisted",
      "a warm yellow lamp",
      locale,
    );
    expect(choice.options.map((option) => option.id)).toEqual(["A", "B"]);
  });

  it("preserves demo illustration URLs and scene mappings", () => {
    expect(DEMO_ILLUSTRATION_URLS).toEqual({
      1: [
        "https://pro.filesystem.site/cdn/20260605/a8fb7f779dcc47958bc34a6175ab5916.png",
        "https://pro.filesystem.site/cdn/20260605/a221e79c2ef3465a89afff7887d7548c.png",
        "https://pro.filesystem.site/cdn/20260605/734aef7c4d9e4b39a519072b985b8fe3.png",
      ],
      2: [
        "https://pro.filesystem.site/cdn/20260605/2c4e2aef3a774ae392b8b3aa1ec93e50.png",
        "https://pro.filesystem.site/cdn/20260605/57ead1878ca644d8b3a61a80b84e6bcb.png",
        "https://pro.filesystem.site/cdn/20260605/5b9d6837e3e24181a8929f6bb4cff50b.png",
      ],
      3: [
        "https://pro.filesystem.site/cdn/20260605/06a94f1afef34ccc9b515a53c39dfbd4.png",
        "https://pro.filesystem.site/cdn/20260605/9d17eb2a7e8c4e4aaa0a715994689bf7.png",
        "https://pro.filesystem.site/cdn/20260605/83910393c17d465ba6f461838c05408c.png",
      ],
      4: [
        "https://pro.filesystem.site/cdn/20260605/9ad2f4ef3ba6421e9972828d328481bb.png",
        "https://pro.filesystem.site/cdn/20260605/cf5dc1b77a874cd78f1a5cde76ffeb21.png",
        "https://pro.filesystem.site/cdn/20260605/fdf0d82f8f2b47d1b9fa282a9d87fec0.png",
      ],
      5: [
        "https://pro.filesystem.site/cdn/20260605/b5dc29fe293846ba8dabfbeacd82ea97.png",
        "https://pro.filesystem.site/cdn/20260605/2fe35a1203cc40df9f633e798a9fd87e.png",
        "https://pro.filesystem.site/cdn/20260605/1bec85b9dcbe417ba39934013d5f7185.png",
      ],
    });
    expect(getDemoSceneIllustrations(1)).toEqual({
      0: [DEMO_ILLUSTRATION_URLS[1][0]],
      1: [DEMO_ILLUSTRATION_URLS[1][1]],
      2: [DEMO_ILLUSTRATION_URLS[1][2]],
    });
  });
});
