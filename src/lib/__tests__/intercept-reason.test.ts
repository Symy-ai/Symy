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
});
