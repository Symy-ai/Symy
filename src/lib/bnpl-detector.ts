/**
 * BNPL Trap Detection — Buy Now Pay Later 诱导识别
 *
 * 🔧 P0-K-1 fix: 斩杀线用户最常被 BNPL 诱导, AI 必须识别并警告
 *
 * 检测关键词: Klarna / Afterpay / Affirm / Zip / "4 payments" / "pay in 4" / "interest-free"
 * 返回 BNPL 上下文, 注入到 AI 的 user message prefix
 */

import { logger } from '@/lib/logger';

/** BNPL 关键词正则 (大小写不敏感) */
const BNPL_PATTERNS: RegExp[] = [
  /klarna/i,
  /afterpay/i,
  /affirm/i,
  /zip\s*pay/i,
  // 🔧 Round 118 fix: 移除 /\bzip\b/i — 误匹配 "zip code", "Zip drive" 等非 BNPL 语境
  //   保留 zip\s*pay (更具体), 用户说 "Zip Pay" 仍能检测
  //   另加 /\bzip\s+(?:pay|quadpay|buy)\b/i 匹配 "Zip pay/Quadpay/Zip buy" 但不匹配 "zip code/zipper"
  //   🔧 Round 119 fix: 去重 (?:pay|quadpay|buy|pay) → (?:pay|quadpay|buy)
  /\bzip\s+(?:pay|quadpay|buy)\b/i,
  // 🔧 Round 120 audit fix: /pay\s*in\s*4/ 只匹配 "pay in 4", 漏了 "pay in 3" 等
  //    改为 /pay\s*in\s*\d+/ 匹配任意期数
  /pay\s*in\s*\d+/i,
  // 🔧 Round 120 audit fix: /4\s*payments?\s*of/ 只匹配 "4 payments of", 漏了 "3/6/12 payments of"
  //    改为 /\d+\s*payments?\s*of/ 匹配任意期数
  /\d+\s*payments?\s*of/i,
  /interest[- ]free/i,
  /buy\s*now\s*pay\s*later/i,
  /installment/i,
  /split\s*into\s*\d+\s*payments?/i,
  // 🔧 Round 125 fix: 移除 /\$\d+\/(month|mo)/ — 误匹配房租/订阅等非 BNPL 月付
  //    BNPL 检测应基于 BNPL 服务名 + 分期关键词, 不应仅凭 "$X/month" 触发
  /quadpay/i,
  /sezzle/i,
  /paypal\s*pay\s*in/i, // PayPal Pay in 4
];

export interface BNPLDetectionResult {
  detected: boolean;
  keywords: string[];
  /** 原始金额 (用户输入的物品金额) */
  itemAmount?: number;
  /** BNPL 每期金额 (如 "4 payments of $150" → 150) */
  perPaymentAmount?: number;
  /** BNPL 期数 (如 "4 payments" → 4) */
  numPayments?: number;
  /** BNPL 总金额 (perPaymentAmount * numPayments, 或 itemAmount) */
  totalAmount?: number;
}

/**
 * 从文本中提取金额
 * "4 payments of $150" → 150
 * "$599" → 599
 */
function extractAmount(text: string): number | undefined {
  // "4 payments of $150" / "4 installments of $75" → 提取 per-payment amount
  const perPaymentMatch = text.match(/(?:payments?|installments?)\s*of\s*\$?([\d,]+)/i);
  if (perPaymentMatch) {
    return parseFloat(perPaymentMatch[1].replace(/,/g, ''));
  }
  // "$599" → 提取 $599
  const dollarMatch = text.match(/\$([\d,]+)/);
  if (dollarMatch) {
    return parseFloat(dollarMatch[1].replace(/,/g, ''));
  }
  return undefined;
}

/**
 * 从文本中提取期数
 * "4 payments" → 4
 * "pay in 4" → 4
 */
function extractNumPayments(text: string): number | undefined {
  const match = text.match(/(\d+)\s*(?:payments?|installments?)/i) || text.match(/pay\s*in\s*(\d+)/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return undefined;
}

/**
 * 检测用户消息中是否包含 BNPL 关键词
 */
export function detectBNPL(userMessage: string, itemAmount?: number): BNPLDetectionResult {
  const msg = userMessage.trim();
  const detectedKeywords: string[] = [];

  for (const pattern of BNPL_PATTERNS) {
    if (pattern.test(msg)) {
      // 提取匹配到的关键词
      const match = msg.match(pattern);
      if (match) {
        detectedKeywords.push(match[0]);
      }
    }
  }

  if (detectedKeywords.length === 0) {
    return { detected: false, keywords: [] };
  }

  const perPaymentAmount = extractAmount(msg);
  const numPayments = extractNumPayments(msg);
  const totalAmount = perPaymentAmount && numPayments
    ? perPaymentAmount * numPayments
    : itemAmount || perPaymentAmount;

  logger.info(`[BNPL Detection] Detected BNPL keywords: ${detectedKeywords.join(', ')}, perPayment: $${perPaymentAmount}, numPayments: ${numPayments}, total: $${totalAmount}`);

  return {
    detected: true,
    keywords: detectedKeywords,
    itemAmount,
    perPaymentAmount,
    numPayments,
    totalAmount,
  };
}

/**
 * 构建 BNPL 上下文前缀, 注入到 AI 的 user message 中
 * 让 AI 知道这是 BNPL 诱导, 需要警告用户
 */
export function buildBNPLContextPrefix(bnpl: BNPLDetectionResult, hourlyRate?: number): string {
  if (!bnpl.detected) return '';

  const total = bnpl.totalAmount || bnpl.itemAmount || 0;
  const perPayment = bnpl.perPaymentAmount || 0;
  const numPayments = bnpl.numPayments || 4; // 默认 4 期

  // 计算生命小时数
  const lifeHours = hourlyRate && hourlyRate > 0 ? Math.round(total / hourlyRate) : 0;
  const lifeHoursStr = lifeHours > 0 ? `${lifeHours} hours of your life` : '';

  // 构建警告文案 (AI 会基于这个 prefix 生成回复)
  // 🔧 优化: 精简提示, 让 AI 有更多自由度 (不要罗列所有风险, 让 AI 选 1-2 个反映)
  const lines: string[] = [
    `[BNPL TRAP DETECTED: ${bnpl.keywords.join(', ')}]`,
  ];

  if (perPayment > 0 && numPayments > 0) {
    lines.push(`Per payment: $${perPayment} × ${numPayments} = $${total} total. The small per-payment amount is the manipulation — it makes $${total} feel like $${perPayment}.`);
  } else if (total > 0) {
    lines.push(`Total cost: $${total}. BNPL splits this into small payments to make it feel affordable.`);
  }

  if (lifeHoursStr) {
    lines.push(`${lifeHoursStr} — the real cost.`);
  }

  lines.push(`Reflect ONE risk (late fees / credit score / no protections / debt pile). Brief. Do NOT list all risks. Do NOT lecture.`);

  return lines.join('\n');
}
