import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const aiErrorFiles = [
  "src/components/chat/hooks/retry-ai-response.ts",
  "src/components/chat/hooks/parts/send-message-error.ts",
  "src/components/chat/hooks/parts/send-message-stream.ts",
];

describe("chat AI error i18n guard", () => {
  it("does not embed default English copy in AI error paths", () => {
    for (const file of aiErrorFiles) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source, file).not.toContain("defaultValue");
    }
  });

  it("guards all three AI error files exist (rename guard)", () => {
    for (const file of aiErrorFiles) {
      expect(() => readFileSync(join(process.cwd(), file), "utf8"), file).not.toThrow();
    }
  });

  it("error paths use i18n error key (t call), not raw literals in user-facing messages", () => {
    // send-message-error 须走 t() — 检查其 import 了 useI18n 类型或 t 引用
    const source = readFileSync(join(process.cwd(), "src/components/chat/hooks/parts/send-message-error.ts"), "utf8");
    expect(source).toMatch(/t\(|useI18n|errorMsgKey/i);
  });
});
