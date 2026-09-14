// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";
import { InterceptReasonChip } from "../intercept-reason-chip";

function translate(key: string): string {
  const result = key
    .replace(/^chat\./, "chat.")
    .split(".")
    .reduce<unknown>((value, segment) => {
      if (value && typeof value === "object" && segment in value) {
        return (value as Record<string, unknown>)[segment];
      }
      return key;
    }, en);
  return typeof result === "string" ? result : key;
}

vi.mock("@/i18n/provider", () => ({
  useI18n: () => ({
    t: (key: string, values?: { defaultValue?: string }) => {
      const fallback = values?.defaultValue;
      if (fallback) return fallback;
      return translate(key);
    },
    locale: "en",
  }),
}));

describe("InterceptReasonChip", () => {
  it("renders the localized non-green reason without money", () => {
    const { container } = render(
      <InterceptReasonChip
        reason={{
          kind: "non_green",
          category: "ivory",
          matchedKeywords: ["ivory"],
        }}
      />,
    );

    expect(screen.getByTestId("intercept-reason-chip").textContent).toContain(
      en.chat.interceptReason.nonGreen.ivory,
    );
    expect(container.textContent).not.toMatch(/formatCurrency|[¥$]\d/);
  });

  it("renders a local impulse fallback for a missing reason", () => {
    render(<InterceptReasonChip itemTitle="plastic-free 水杯" />);

    expect(screen.getByTestId("intercept-reason-chip").textContent).toContain(
      en.chat.interceptReason.impulse,
    );
  });

  it("renders nothing for unknown and budget reasons", () => {
    const { container } = render(
      <>
        <InterceptReasonChip reason={{ kind: "unknown" }} />
        <InterceptReasonChip reason={{ kind: "budget" }} />
      </>,
    );

    expect(container.textContent).toBe("");
  });
});
