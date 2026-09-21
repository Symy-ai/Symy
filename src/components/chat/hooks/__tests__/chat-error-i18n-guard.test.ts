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
});
