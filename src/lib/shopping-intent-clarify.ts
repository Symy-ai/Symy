export type ShoppingIntentConfidence = 'high' | 'clarify' | 'not_purchase';
export type ShoppingClarifySlot = 'recipient' | 'category' | 'timing';

export type GuardCategory = 'electronics' | 'clothing' | 'beauty' | 'home' | 'food';

export interface ShoppingIntentClarifyData {
  subject: string;
  slot: ShoppingClarifySlot;
}

export type ShoppingIntentClarifyResult =
  | { confidence: 'high' }
  | { confidence: 'clarify'; data: ShoppingIntentClarifyData }
  | { confidence: 'not_purchase'; subject: string };

export interface ClassifyShoppingIntentInput {
  message: string;
  locale: 'en' | 'zh';
  askedSubjects?: readonly string[];
}

const PURCHASE_PATTERN = /买|下单|点(?:一?[杯份单])?|订购|购买|搜索|帮我搜|want|need|buy|get|purchase|order|shop(?:ping)? for|search for|look(?:ing)? for/i;
const FIRST_PARTY_PATTERN = /我|帮(?:我)?|给自己|\bI\b|\bhelp me\b|\bmyself\b|\bmy own\b/i;
const UNCERTAIN_PATTERN = /不确定|不知道|还是|或者|\bnot sure\b|\bunsure\b|\bwhether or\b|\bor\b/i;
const RECIPIENT_PATTERN = /送人|礼物|给(?:妈妈|爸爸|孩子|朋友|家人|老人)|我妈|我妈|for my (?:mom|mother|dad|father|kid|child|friend|family)|\bfor (?:her|him|them)\b|\bfor my\b|\ba gift\b/i;
const FUTURE_PATTERN = /下(?:个月|周|次)|以后|回头|再看看|next (?:month|week|time)|later|maybe/i;
const CAMPING_PATTERN = /露营|camping/i;

const CATEGORY_SIGNALS: Record<GuardCategory, RegExp> = {
  electronics: /电子|电器|手机|电脑|耳机|electronics|phone|laptop|headphones?/i,
  clothing: /衣|鞋|外套|衣服|clothes|clothing|shoes|jacket/i,
  beauty: /美妆|护肤|化妆品|beauty|skincare|makeup|cosmetics/i,
  home: /家居|家具|日用品|home|furniture|household/i,
  food: /吃的|喝的|零食|饮料|奶茶|food|snacks?|drinks?|bubble ?tea/i,
};

function highConfidence(message: string): boolean {
  return PURCHASE_PATTERN.test(message) && FIRST_PARTY_PATTERN.test(message) && !UNCERTAIN_PATTERN.test(message);
}

function subjectOf(message: string): string {
  const chinese = message.match(/(?:买|搜索|搜|看看|look(?:ing)? for|search(?:ing)? for|shop(?:ping)? for|get|buy)([^，。,.!?？!]+)/i);
  return (chinese?.[1] ?? message).trim().slice(0, 40);
}

function subjectAsked(subject: string, askedSubjects: readonly string[]): boolean {
  const normalized = subject.toLowerCase();
  return askedSubjects.some((asked) => asked.toLowerCase() === normalized);
}

export function classifyShoppingIntent({
  message,
  locale: _locale,
  askedSubjects = [],
}: ClassifyShoppingIntentInput): ShoppingIntentClarifyResult {
  const text = message.trim();
  if (!text) return { confidence: 'high' };

  const mentioned = PURCHASE_PATTERN.test(text) || /看看|look at/i.test(text);
  if (!mentioned) return { confidence: 'not_purchase', subject: subjectOf(text) };

  const subject = subjectOf(text);
  if (subjectAsked(subject, askedSubjects)) return { confidence: 'high' };

  if (RECIPIENT_PATTERN.test(text) && UNCERTAIN_PATTERN.test(text)) {
    return { confidence: 'clarify', data: { subject, slot: 'recipient' } };
  }

  if (CAMPING_PATTERN.test(text) && FUTURE_PATTERN.test(text)) {
    return { confidence: 'clarify', data: { subject, slot: 'timing' } };
  }

  if (/孩子|kids?|children/i.test(text)) {
    return { confidence: 'clarify', data: { subject, slot: 'category' } };
  }

  if (highConfidence(text)) return { confidence: 'high' };

  return { confidence: 'not_purchase', subject };
}

export function existingCategoryOf(text: string): GuardCategory | null {
  const entry = (Object.entries(CATEGORY_SIGNALS) as [GuardCategory, RegExp][]).find(([, pattern]) => pattern.test(text));
  return entry ? entry[0] : null;
}
