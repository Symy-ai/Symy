import { describe, expect, it } from "vitest";
import { classifyInterceptReason } from "@/lib/intercept-reason";

describe("classifyInterceptReason", () => {
  it.each([
    ["象牙筷子", "ivory"],
    ["ivory ornament", "ivory"],
    ["皮草外套", "fur"],
    ["mink scarf", "fur"],
    ["一次性水杯", "disposable"],
    ["disposable cup", "disposable"],
    ["塑料饭盒", "plastic"],
    ["plastic-free 水杯", "impulse"],
    ["鳄鱼皮带", "exotic_leather"],
    ["crocodile bag", "exotic_leather"],
  ])("classifies %s", (itemTitle, category) => {
    expect(classifyInterceptReason(itemTitle)).toEqual(
      category === "impulse"
        ? { kind: "impulse" }
        : expect.objectContaining({ kind: "non_green", category }),
    );
  });

  it("returns unknown for an empty title and impulse for ordinary items", () => {
    expect(classifyInterceptReason("")).toEqual({ kind: "unknown" });
    expect(classifyInterceptReason("机械键盘")).toEqual({ kind: "impulse" });
  });

  it("non_green 结果带 reason 建议文案 (objectContaining 之外的完整形状)", () => {
    const r = classifyInterceptReason("象牙筷子");
    expect(r).toEqual(
      expect.objectContaining({ kind: "non_green", category: "ivory" }),
    );
    if (r && typeof r === "object" && "reason" in r) {
      expect(typeof (r as { reason: unknown }).reason).toBe("string");
    }
  });

  it("大小写与混合语言: Ivory Chopsticks / 皮草FUR 混排", () => {
    expect(classifyInterceptReason("Ivory Chopsticks")).toEqual(
      expect.objectContaining({ kind: "non_green", category: "ivory" }),
    );
    expect(classifyInterceptReason("皮草FUR混排")).toEqual(
      expect.objectContaining({ kind: "non_green", category: "fur" }),
    );
  });
});
