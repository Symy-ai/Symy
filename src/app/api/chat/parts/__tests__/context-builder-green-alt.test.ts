/**
 * 绿色替代话术注入测试 — symy_green_alternatives
 *
 * 覆盖: pref on 全类目注入 / pref off 零注入 / locale 选择 / 超长话术单行截断 / 库异常静默降级。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const alternativeEntries = vi.hoisted(() => [
  {
    id: "ivory_bone_carving",
    alternative: {
      zh: "可以选择橄榄核雕或竹雕。",
      en: "Choose olive-nut or bamboo carving.",
    },
    reuse: { zh: "先看看木制手串。", en: "Check a wooden strand first." },
  },
  {
    id: "fur",
    alternative: { zh: "仿皮草很接近。", en: "Faux fur gets close." },
    reuse: { zh: "旧外套先穿一季。", en: "Wear the old coat first." },
  },
  {
    id: "single_use_plastic",
    alternative: { zh: "选不锈钢耐用版。", en: "Pick durable steel." },
    reuse: { zh: "翻出现有水杯。", en: "Reuse your bottle." },
  },
  {
    id: "fast_fashion",
    alternative: { zh: "看看二手古着。", en: "Try secondhand vintage." },
    reuse: { zh: "重新搭配基础款。", en: "Restyle your basics." },
  },
  {
    id: "tissues",
    alternative: { zh: "棉手帕可重复使用。", en: "Use washable cotton." },
    reuse: { zh: "旧T恤可做抹布。", en: "Turn old tees into rags." },
  },
  {
    id: "batteries",
    alternative: { zh: "充电电池更耐用。", en: "Rechargeables last." },
    reuse: { zh: "先测试旧电池。", en: "Test old cells first." },
  },
]);

vi.mock("@/lib/green-alternatives", () => ({
  GREEN_ALTERNATIVES: alternativeEntries,
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { buildGreenAlternativesContext } from "../context-builder";

describe("buildGreenAlternativesContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("greenPref on → 注入全部类目话术 (抽样 + 计数 + 行数预算)", () => {
    const result = buildGreenAlternativesContext("on", "zh");

    expect(result).toContain("[symy_green_alternatives]");
    expect(result).toContain(
      "ivory_bone_carving: 可以选择橄榄核雕或竹雕。先看看木制手串。",
    );
    expect(result).toContain("fast_fashion: 看看二手古着。重新搭配基础款。");
    expect(result).toContain(
      "single_use_plastic: 选不锈钢耐用版。翻出现有水杯。",
    );
    const lines = result?.split("\n") ?? [];
    expect(lines).toHaveLength(alternativeEntries.length + 1);
    expect(lines.length).toBeLessThanOrEqual(30);
  });

  it("greenPref off → 零注入 (与接线前 prompt 一致)", () => {
    expect(buildGreenAlternativesContext("off", "zh")).toBeUndefined();
  });

  it("locale en → 使用英文话术", () => {
    expect(buildGreenAlternativesContext("on", "en")).toContain(
      "fast_fashion: Try secondhand vintage. Restyle your basics.",
    );
  });

  it("超长话术 → 截断为一行且保留类目", () => {
    const original = alternativeEntries[0].alternative.zh;
    alternativeEntries[0].alternative.zh = "长".repeat(300);
    try {
      const line = buildGreenAlternativesContext("on", "zh")?.split("\n")[1];
      expect(line?.startsWith("ivory_bone_carving: 长")).toBe(true);
      expect(line?.endsWith("...")).toBe(true);
      expect(line?.length).toBeLessThanOrEqual(240);
    } finally {
      alternativeEntries[0].alternative.zh = original;
    }
  });

  it("话术库遍历异常 → 静默降级且不抛错", () => {
    const original = alternativeEntries[1].alternative;
    Object.defineProperty(alternativeEntries[1], "alternative", {
      get() {
        throw new Error("green alternatives read failed");
      },
      configurable: true,
    });

    try {
      expect(() => buildGreenAlternativesContext("on", "zh")).not.toThrow();
      expect(buildGreenAlternativesContext("on", "zh")).toBeUndefined();
    } finally {
      Object.defineProperty(alternativeEntries[1], "alternative", {
        value: original,
        configurable: true,
      });
    }
  });
});
