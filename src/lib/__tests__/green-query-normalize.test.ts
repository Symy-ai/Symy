import { describe, expect, it } from "vitest";

import { normalizeGreenQuery } from "@/lib/green-query-normalize";

describe("green-query-normalize 插入语剥离表 (batch69-a)", () => {
  it.each([
    ["买个沙发", "买沙发"],
    ["买一个沙发", "买沙发"],
    ["买这个沙发", "买沙发"],
    ["买那个沙发", "买沙发"],
    ["买只猫", "买猫"],
    ["买台电视", "买电视"],
    ["买部手机", "买手机"],
    ["买一件外套", "买外套"],
    ["买一张桌子", "买桌子"],
    ["买一套沙发", "买沙发"],
    ["买新沙发", "买沙发"],
    ["买新的沙发", "买沙发"],
    ["买二手沙发", "买沙发"],
    ["买全新沙发", "买沙发"],
    ["想买个新沙发", "想买沙发"],
    ["要买台新电视", "要买电视"],
    ["置换一辆车", "置换车"],
    ["换部新手机", "换手机"],
    ["不想买个沙发", "不想买沙发"],
    ["买个沙发换个书架", "买沙发换书架"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeGreenQuery(input)).toBe(expected);
  });
});

describe("green-query-normalize 边界自证", () => {
  it("买单 不被拆坏 (单是名词, 非插入语)", () => {
    expect(normalizeGreenQuery("买单")).toBe("买单");
    expect(normalizeGreenQuery("请客买单")).toBe("请客买单");
  });

  it("插入语后无名词残余不剥 (以旧换新 / 想买个 / 不想买 / 不买了)", () => {
    expect(normalizeGreenQuery("以旧换新")).toBe("以旧换新");
    expect(normalizeGreenQuery("想买个")).toBe("想买个");
    expect(normalizeGreenQuery("不想买")).toBe("不想买");
    expect(normalizeGreenQuery("不买了")).toBe("不买了");
  });

  it("归一化保留名词核 (买新沙发 仍含 沙发)", () => {
    expect(normalizeGreenQuery("买新沙发")).toContain("沙发");
  });

  it("en 查询恒等 (英语无该结构, 仅 zh)", () => {
    expect(normalizeGreenQuery("buy a new sofa")).toBe("buy a new sofa");
    expect(normalizeGreenQuery("Buy A New Sofa")).toBe("Buy A New Sofa");
  });

  it("非购物 zh 句不误伤 (无购买动词则不剥)", () => {
    expect(normalizeGreenQuery("帮我看下这个 pdf 发票")).toBe(
      "帮我看下这个 pdf 发票",
    );
    expect(normalizeGreenQuery("想借一本新出的小说")).toBe(
      "想借一本新出的小说",
    );
  });

  it("非字符串输入原样返回 (纯函数不抛异常)", () => {
    expect(normalizeGreenQuery(undefined as unknown as string)).toBeUndefined();
    expect(normalizeGreenQuery(null as unknown as string)).toBeNull();
  });
});
