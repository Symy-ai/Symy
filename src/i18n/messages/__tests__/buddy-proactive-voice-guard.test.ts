import { describe, expect, it } from "vitest";

import en from "../en.json";
import zh from "../zh.json";

const categories: Array<{ key: string; count: number }> = [
  { key: "morning", count: 8 },
  { key: "evening", count: 8 },
  { key: "absence", count: 8 },
  { key: "streak", count: 8 },
  { key: "completed", count: 8 },
  { key: "failed", count: 8 },
  { key: "low_vitality", count: 8 },
  { key: "high_vitality", count: 8 },
  { key: "awakened", count: 6 },
  { key: "grew", count: 6 },
];

const zombieVoice = /静心|该呼吸了|My light is dim|Hold me|看看星星|静默/;
const guardianAnchors = /守护|守住|绿色|地球|森林|安静|自由时间|quiet|guardian|forest|calm/;

const zhMessages: Record<string, string> = zh.buddy.proactiveMessages;
const enMessages: Record<string, string> = en.buddy.proactiveMessages;

describe("buddy proactive message voice", () => {
  it.each(categories)(
    "keeps the %s pool with %i keys and matching zh/en sets",
    ({ key, count }) => {
      const expectedKeys = Array.from({ length: count }, (_, i) => `${key}_${i + 1}`);
      const zhCategoryKeys = Object.keys(zhMessages)
        .filter((k) => k.startsWith(`${key}_`))
        .sort();
      const enCategoryKeys = Object.keys(enMessages)
        .filter((k) => k.startsWith(`${key}_`))
        .sort();

      expect(zhCategoryKeys).toEqual(expectedKeys);
      expect(enCategoryKeys).toEqual(expectedKeys);
      expect(
        expectedKeys.every((k) => typeof zhMessages[k] === "string"),
      ).toBe(true);
      expect(
        expectedKeys.every((k) => typeof enMessages[k] === "string"),
      ).toBe(true);
    },
  );

  it("keeps zh/en proactive message key sets equal", () => {
    expect(Object.keys(zhMessages).sort()).toEqual(Object.keys(enMessages).sort());
  });

  it("removes the telegraphic zombie voice", () => {
    for (const value of Object.values(zhMessages)) {
      expect(value).not.toMatch(zombieVoice);
    }
    for (const value of Object.values(enMessages)) {
      expect(value).not.toMatch(zombieVoice);
    }
  });

  it("keeps enough guardian and green anchors in Chinese", () => {
    const anchoredValues = Object.values(zhMessages).filter((value) =>
      guardianAnchors.test(value),
    );

    expect(anchoredValues.length).toBeGreaterThanOrEqual(12);
  });

  it("keeps every English message conversational", () => {
    for (const value of Object.values(enMessages)) {
      expect(value.length).toBeGreaterThan(12);
    }
  });

  it("starts each entry uniquely within its Chinese category", () => {
    for (const { key, count } of categories) {
      const starts = Array.from({ length: count }, (_, i) =>
        zhMessages[`${key}_${i + 1}`].slice(0, 4),
      );
      expect(new Set(starts).size).toBe(starts.length);
    }
  });

  it("starts each entry uniquely within its English category", () => {
    for (const { key, count } of categories) {
      const starts = Array.from({ length: count }, (_, i) =>
        enMessages[`${key}_${i + 1}`]
          .toLowerCase()
          .split(/\s+/)
          .slice(0, 3)
          .join(" "),
      );
      expect(new Set(starts).size).toBe(starts.length);
    }
  });
});
