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

describe("green-query-normalize 囤系口语动词 (batch76-a)", () => {
  it.each([
    // 简报发现 #1 三连: 动词「囤」+ 约量「点/些」+ 名词 → 剥成动宾连写
    ["囤点洗衣液", "囤洗衣液"],
    ["给娃囤点绘本", "给娃囤绘本"],
    ["囤点纸巾", "囤纸巾"],
    ["囤些零食", "囤零食"],
    ["先囤点洗衣液再说", "先囤洗衣液再说"],
    ["618 囤点纸巾", "618 囤纸巾"],
    // 「点/些」入插入语表后对既有 买/换 系的自然外溢 (约量词, 同为口语常态)
    ["买点水果", "买水果"],
    ["买些什么好", "买什么好"],
    ["换点零钱", "换零钱"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeGreenQuery(input)).toBe(expected);
  });

  it("动词后无名词残余不剥 (与 想买个 同规)", () => {
    expect(normalizeGreenQuery("囤点")).toBe("囤点");
    expect(normalizeGreenQuery("囤些")).toBe("囤些");
    expect(normalizeGreenQuery("买点")).toBe("买点");
  });

  it("囤系否定句按现状恒等 (不新增否定逻辑)", () => {
    expect(normalizeGreenQuery("不囤了")).toBe("不囤了");
    expect(normalizeGreenQuery("不囤")).toBe("不囤");
    expect(normalizeGreenQuery("我想好了不囤了, 太占地方")).toBe(
      "我想好了不囤了, 太占地方",
    );
  });

  it("「来点/点个」保守不冒进: 点 非购买动词, 不产生 点X 连写", () => {
    // 实测 (batch76-a): 点个外卖/来点纸巾 均经裸名词 trigger (外卖/纸巾)
    // 严格命中, 归一化无增益; 贸然立 点 为动词会把 点个赞 剥成 点赞 类
    // 非购物连写 — 保持不收。
    expect(normalizeGreenQuery("点个外卖")).toBe("点个外卖");
    expect(normalizeGreenQuery("点个赞")).toBe("点个赞");
    expect(normalizeGreenQuery("来点纸巾")).toBe("来点纸巾");
  });

  it("混排按 zh 处理, en 恒等 (囤 系同规)", () => {
    expect(normalizeGreenQuery("囤 laundry detergent")).toBe(
      "囤 laundry detergent",
    );
    expect(normalizeGreenQuery("囤点 tissues")).toBe("囤 tissues");
    expect(normalizeGreenQuery("囤点tissues")).toBe("囤tissues");
  });
});
