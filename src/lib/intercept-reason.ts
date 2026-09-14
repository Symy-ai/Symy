import { NON_GREEN_NEGATION_PHRASES, NON_GREEN_RULES } from "@/lib/green-rules";

export type InterceptReasonKind =
  "non_green" | "impulse" | "budget" | "unknown";

export interface InterceptReason {
  kind: InterceptReasonKind;
  category?: string;
  matchedKeywords?: string[];
}

const ASCII_KEYWORD = /^[\x20-\x7E]+$/;

function escapeRegExp(keyword: string): string {
  return keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripNegations(itemTitle: string): string {
  return NON_GREEN_NEGATION_PHRASES.reduce((text, phrase) => {
    const pattern = new RegExp(escapeRegExp(phrase), "gi");
    return text.replace(pattern, " ");
  }, itemTitle);
}

function containsKeyword(itemTitle: string, keyword: string): boolean {
  if (!ASCII_KEYWORD.test(keyword)) return itemTitle.includes(keyword);
  return new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i").test(itemTitle);
}

export function classifyInterceptReason(itemTitle: string): InterceptReason {
  if (!itemTitle) return { kind: "unknown" };

  const title = stripNegations(itemTitle);
  for (const rule of NON_GREEN_RULES) {
    const matchedKeywords = rule.keywords.filter((keyword) =>
      containsKeyword(title, keyword),
    );
    if (matchedKeywords.length > 0) {
      return { kind: "non_green", category: rule.category, matchedKeywords };
    }
  }

  return { kind: "impulse" };
}
