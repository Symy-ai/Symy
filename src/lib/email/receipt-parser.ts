/**
 * 邮件购物收据解析器
 *
 * 从邮件内容中识别购物收据/订单确认邮件，
 * 提取平台、订单号、商品名、金额等关键信息。
 */

import { addDays, format, subDays } from 'date-fns';

export interface ParsedReceipt {
  platform: string;
  orderId?: string;
  itemName?: string;
  amount?: number;
  currency: string;
  isReceipt: boolean;
  confidence: number; // 0-1, 解析置信度
  refundEligible: boolean;
  refundDeadlineDays?: number; // 退款期限天数
}

// 已知电商平台的邮件收据模式
const PLATFORM_PATTERNS: Record<string, {
  senderPatterns: RegExp[];
  subjectPatterns: RegExp[];
  amountPatterns: RegExp[];
  orderIdPatterns: RegExp[];
  itemNamePatterns: RegExp[];
  refundDays?: number;
}> = {
  tiktok_shop: {
    senderPatterns: [
      /tiktok/i,
      /shop\.tiktok/i,
      /order.*tiktok/i,
    ],
    subjectPatterns: [
      /order confirmation/i,
      /purchase receipt/i,
      /your tiktok shop order/i,
      /order received/i,
      /thank you for your purchase/i,
    ],
    amountPatterns: [
      /\btotal[:\s]*\$?([\d,]+\.?\d*)/i,
      /amount[:\s]*\$?([\d,]+\.?\d*)/i,
      /charged[:\s]*\$?([\d,]+\.?\d*)/i,
    ],
    orderIdPatterns: [
      /order\s*(?:id|number|#)[:\s]*([A-Z0-9\-]+)/i,
      /order[:\s]*([A-Z0-9\-]{8,})/i,
    ],
    itemNamePatterns: [
      /item[:\s]*(.+?)(?:\n|$)/i,
      /product[:\s]*(.+?)(?:\n|$)/i,
    ],
    refundDays: 30,
  },
  amazon: {
    senderPatterns: [
      /amazon\.com/i,
      /shipment@amazon/i,
      /auto-confirm@amazon/i,
    ],
    subjectPatterns: [
      /your amazon\.com order/i,
      /order confirmation/i,
      /shipment confirmation/i,
      /amazon\.com.*order/i,
    ],
    amountPatterns: [
      /order total[:\s]*\$?([\d,]+\.?\d*)/i,
      /\btotal[:\s]*\$?([\d,]+\.?\d*)/i,
      /grand total[:\s]*\$?([\d,]+\.?\d*)/i,
    ],
    orderIdPatterns: [
      /order\s*(?:number|#)[:\s]*(\d{3}-\d{7}-\d{7})/i,
      /#\s*(\d{3}-\d{7}-\d{7})/,
    ],
    itemNamePatterns: [
      /(?:purchased|bought|item)[:\s]*(.+?)(?:\n|$)/i,
    ],
    refundDays: 30,
  },
  target: {
    senderPatterns: [
      /target\.com/i,
      /order@target/i,
    ],
    subjectPatterns: [
      /target order/i,
      /your target order/i,
      /order confirmation.*target/i,
    ],
    amountPatterns: [
      /order total[:\s]*\$?([\d,]+\.?\d*)/i,
      /\btotal[:\s]*\$?([\d,]+\.?\d*)/i,
    ],
    orderIdPatterns: [
      /order\s*#[:\s]*(\w+)/i,
    ],
    itemNamePatterns: [],
    refundDays: 90,
  },
  walmart: {
    senderPatterns: [
      /walmart\.com/i,
      /order@walmart/i,
    ],
    subjectPatterns: [
      /walmart order/i,
      /your walmart order/i,
      /order confirmation.*walmart/i,
    ],
    amountPatterns: [
      /order total[:\s]*\$?([\d,]+\.?\d*)/i,
      /\btotal[:\s]*\$?([\d,]+\.?\d*)/i,
    ],
    orderIdPatterns: [
      /order\s*#[:\s]*(\w+)/i,
    ],
    itemNamePatterns: [],
    refundDays: 90,
  },
  shein: {
    senderPatterns: [
      /shein\.com/i,
      /noreply@shein/i,
    ],
    subjectPatterns: [
      /shein order/i,
      /order confirmation.*shein/i,
      /your order has been placed/i,
    ],
    amountPatterns: [
      /\btotal[:\s]*\$?([\d,]+\.?\d*)/i,
      /amount[:\s]*\$?([\d,]+\.?\d*)/i,
    ],
    orderIdPatterns: [
      /order\s*(?:number|#)[:\s]*([A-Z0-9]+)/i,
    ],
    itemNamePatterns: [],
    refundDays: 45,
  },
  temu: {
    senderPatterns: [
      /temu\.com/i,
      /noreply@temu/i,
    ],
    subjectPatterns: [
      /temu order/i,
      /order confirmation.*temu/i,
      /your temu order/i,
    ],
    amountPatterns: [
      /\btotal[:\s]*\$?([\d,]+\.?\d*)/i,
      /amount[:\s]*\$?([\d,]+\.?\d*)/i,
    ],
    orderIdPatterns: [
      /order\s*#[:\s]*([A-Z0-9\-]+)/i,
    ],
    itemNamePatterns: [],
    refundDays: 90,
  },
  ebay: {
    senderPatterns: [
      /ebay\.com/i,
      /order@ebay/i,
    ],
    subjectPatterns: [
      /ebay.*order/i,
      /order confirmation.*ebay/i,
      /purchase confirmation/i,
    ],
    amountPatterns: [
      /\btotal[:\s]*\$?([\d,]+\.?\d*)/i,
      /order total[:\s]*\$?([\d,]+\.?\d*)/i,
    ],
    orderIdPatterns: [
      /order\s*#[:\s]*(\d+)/i,
    ],
    itemNamePatterns: [],
    refundDays: 30,
  },
  shopify_generic: {
    senderPatterns: [
      /shopify/i,
      /checkout/i,
    ],
    subjectPatterns: [
      /order confirmation/i,
      /thank you for your purchase/i,
      /receipt for your order/i,
    ],
    amountPatterns: [
      /\btotal[:\s]*\$?([\d,]+\.?\d*)/i,
    ],
    orderIdPatterns: [
      /order\s*(?:number|#)[:\s]*([A-Z0-9\-]+)/i,
    ],
    itemNamePatterns: [],
    refundDays: 30,
  },
  // 🔧 ARCH fix (Round 23 M5 — 添加 Etsy + AliExpress 平台模式):
  etsy: {
    senderPatterns: [
      /etsy/i,
      /transaction/i,
    ],
    subjectPatterns: [
      /receipt from etsy/i,
      /your etsy order/i,
      /order receipt/i,
    ],
    amountPatterns: [
      /\btotal[:\s]*\$?([\d,]+\.?\d*)/i,
      /amount[:\s]*\$?([\d,]+\.?\d*)/i,
    ],
    orderIdPatterns: [
      /order\s*(?:id|number|#)[:\s]*([A-Z0-9\-]+)/i,
    ],
    itemNamePatterns: [],
    refundDays: 30,
  },
  aliexpress: {
    senderPatterns: [
      /aliexpress/i,
      /aliexpress\.com/i,
    ],
    subjectPatterns: [
      /order confirmation/i,
      /your aliexpress order/i,
      /payment confirmation/i,
      /dispatch notice/i,
    ],
    amountPatterns: [
      /\btotal[:\s]*\$?([\d,]+\.?\d*)/i,
      /amount[:\s]*\$?([\d,]+\.?\d*)/i,
    ],
    orderIdPatterns: [
      /order\s*(?:id|number|#)[:\s]*([A-Z0-9\-]+)/i,
    ],
    itemNamePatterns: [],
    refundDays: 30,
  },
  nike: {
    senderPatterns: [
      /nike/i,
    ],
    subjectPatterns: [
      /order confirmation/i,
      /your nike order/i,
      /receipt/i,
    ],
    amountPatterns: [
      /\btotal[:\s]*\$?([\d,]+\.?\d*)/i,
    ],
    orderIdPatterns: [
      /order\s*(?:number|#)[:\s]*([A-Z0-9\-]+)/i,
    ],
    itemNamePatterns: [],
    refundDays: 30,
  },
  starbucks: {
    senderPatterns: [
      /starbucks/i,
    ],
    subjectPatterns: [
      /receipt/i,
      /your order/i,
      /pickup/i,
    ],
    amountPatterns: [
      /\btotal[:\s]*\$?([\d,]+\.?\d*)/i,
      /amount[:\s]*\$?([\d,]+\.?\d*)/i,
    ],
    orderIdPatterns: [],
    itemNamePatterns: [],
    refundDays: 7,
  },
};

// 通用收据关键词（任何平台都可能是收据）
const GENERIC_RECEIPT_KEYWORDS = [
  /order confirmation/i,
  /purchase receipt/i,
  /receipt for/i,
  /thank you for your (?:order|purchase)/i,
  /your order has been (?:placed|confirmed|received)/i,
  /payment (?:confirmed|received|successful)/i,
  /transaction receipt/i,
  /order summary/i,
  /purchase confirmation/i,
];

/**
 * 判断邮件是否是购物收据
 */
export function isReceiptEmail(
  from: string,
  subject: string,
  snippet: string,
): boolean {
  const _text = `${from} ${subject} ${snippet}`;

  // 检查平台特定模式
  for (const patterns of Object.values(PLATFORM_PATTERNS)) {
    const senderMatch = patterns.senderPatterns.some((p) => p.test(from));
    const subjectMatch = patterns.subjectPatterns.some((p) => p.test(subject));

    if (senderMatch && subjectMatch) return true;
    if (senderMatch && GENERIC_RECEIPT_KEYWORDS.some((p) => p.test(subject))) return true;
  }

  // 检查通用收据关键词
  const keywordMatch = GENERIC_RECEIPT_KEYWORDS.some((p) => p.test(subject));
  if (keywordMatch) return true;

  // 检查 snippet 中的关键线索
  const snippetHints = /order\s*#\d+|total[:\s]*\$\d+|purchase of \$\d+/i;
  if (snippetHints.test(snippet) && /order|purchase|buy|receipt/i.test(subject)) return true;

  return false;
}

/**
 * 解析邮件内容，提取购物收据信息
 */
export function parseReceipt(
  from: string,
  subject: string,
  snippet: string,
  body?: string,
): ParsedReceipt {
  const fullText = body || snippet;
  const result: ParsedReceipt = {
    platform: 'unknown',
    isReceipt: false,
    confidence: 0,
    currency: 'USD',
    refundEligible: false,
  };

  // 匹配平台 — 优先匹配 sender（更可靠），再 fallback 到 subject
  // 第一轮：找 sender match（最高优先级）
  let matchedPlatform: string | null = null;
  let matchedPatterns: typeof PLATFORM_PATTERNS[string] | null = null;
  let matchedConfidence = 0;

  for (const [platform, patterns] of Object.entries(PLATFORM_PATTERNS)) {
    const senderMatch = patterns.senderPatterns.some((p) => p.test(from));
    if (senderMatch) {
      const subjectMatch = patterns.subjectPatterns.some((p) => p.test(subject));
      matchedPlatform = platform;
      matchedPatterns = patterns;
      matchedConfidence = subjectMatch ? 0.95 : 0.7;
      break; // Sender match is definitive — stop looking
    }
  }

  // 第二轮：如果没有 sender match，找 subject-only match
  if (!matchedPlatform) {
    for (const [platform, patterns] of Object.entries(PLATFORM_PATTERNS)) {
      const subjectMatch = patterns.subjectPatterns.some((p) => p.test(subject));
      if (subjectMatch) {
        matchedPlatform = platform;
        matchedPatterns = patterns;
        matchedConfidence = 0.5;
        break; // Use first subject match
      }
    }
  }

  if (matchedPlatform && matchedPatterns) {
    result.platform = matchedPlatform;
    result.isReceipt = true;
    result.confidence = matchedConfidence;
    result.refundDeadlineDays = matchedPatterns.refundDays;
    result.refundEligible = true;

    // 提取金额
    // 🔧 ARCH fix (Round 31 AUDIT-6 MEDIUM-1): 旧代码 parseFloat(match[1]) 不处理逗号
    //    "$1,234.56" → match[1]="1" (逗号截断) → $1 而非 $1234.56
    //    "12,99 €" (European) → match[1]="12" → €12 而非 €12.99
    //    根因修复: 先 strip 逗号, 再 parseFloat; 若无小数点但有逗号, 视为欧洲小数
    for (const amountPattern of matchedPatterns.amountPatterns) {
      const match = fullText.match(amountPattern);
      if (match?.[1]) {
        let rawAmount = match[1];
        // Handle US thousands separators: "1,234.56" → "1234.56"
        if (rawAmount.includes(',') && rawAmount.includes('.')) {
          rawAmount = rawAmount.replace(/,/g, '');
        }
        // Handle European decimal: "12,99" → "12.99" (comma as decimal separator, no period)
        else if (rawAmount.includes(',') && !rawAmount.includes('.')) {
          rawAmount = rawAmount.replace(',', '.');
        }
        const parsed = parseFloat(rawAmount);
        result.amount = Number.isFinite(parsed) ? parsed : undefined; // BUG fix: NaN 防护
        break;
      }
    }

    // 提取订单号
    for (const orderIdPattern of matchedPatterns.orderIdPatterns) {
      const match = fullText.match(orderIdPattern);
      if (match?.[1]) {
        result.orderId = match[1];
        break;
      }
    }

    // 提取商品名
    for (const itemNamePattern of matchedPatterns.itemNamePatterns) {
      const match = fullText.match(itemNamePattern);
      if (match?.[1]) {
        result.itemName = match[1].trim().substring(0, 200);
        break;
      }
    }
  }

  // 如果没匹配到特定平台，尝试通用解析
  if (!result.isReceipt) {
    if (isReceiptEmail(from, subject, snippet)) {
      result.isReceipt = true;
      result.platform = 'unknown';
      result.confidence = 0.3;
      result.refundEligible = true;
      result.refundDeadlineDays = 30;

      // 通用金额提取
      const amountMatch = fullText.match(/\btotal[:\s]*\$?([\d,]+\.?\d*)/i);
      if (amountMatch?.[1]) {
        const parsed = parseFloat(amountMatch[1]);
        result.amount = Number.isFinite(parsed) ? parsed : undefined; // BUG fix: NaN 防护
      }

      // 通用订单号提取
      const orderIdMatch = fullText.match(/order\s*(?:number|#)[:\s]*([A-Z0-9\-]+)/i);
      if (orderIdMatch?.[1]) {
        result.orderId = orderIdMatch[1];
      }
    }
  }

  return result;
}

/**
 * 根据平台和时间判断是否仍在退款窗口内
 */
// 🔧 架构优化 (2026-06-30): isWithinRefundWindow 已删除 (死代码, 无 consumer)
// 如需检查, 用 isAfter(addDays(date, days), new Date()) 直接调用

/**
 * 计算退款截止日期
 */
export function getRefundDeadline(
  purchaseDate: Date,
  refundDeadlineDays?: number,
): Date {
  return addDays(purchaseDate, refundDeadlineDays || 30);
}

/**
 * 已知电商平台的发件人域名列表（用于快速过滤）
 */
export const KNOWN_SHOPPING_DOMAINS = [
  'tiktok.com',
  'amazon.com',
  'target.com',
  'walmart.com',
  'shein.com',
  'temu.com',
  'ebay.com',
  'etsy.com',
  'aliexpress.com',
  'wish.com',
  'wayfair.com',
  'bestbuy.com',
  'costco.com',
  'homedepot.com',
  'nike.com',
  'adidas.com',
  'zara.com',
  'hm.com',
  'uniqlo.com',
  'shopify.com',
  'checkout.shopify.com',
  'shop.app',
];

/**
 * 构建 Gmail 搜索查询 (用于 Gmail API list 方法)
 * 只获取最近的购物收据类邮件
 */
export function buildGmailReceiptQuery(daysBack = 7): string {
  const dateStr = format(subDays(new Date(), daysBack), 'yyyy/MM/dd');

  // Gmail 搜索语法: 收件箱 + 近N天 + 订单/收据关键词
  return `in:inbox after:${dateStr} (subject:"order confirmation" OR subject:"purchase receipt" OR subject:"receipt for" OR subject:"order summary" OR subject:"thank you for your order" OR subject:"order received" OR subject:"your order has been")`;
}

