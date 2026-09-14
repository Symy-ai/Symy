/**
 * format helpers — 全局格式化工具 (P1-19 fix + P1-1 fix: locale-aware currency)
 *
 * 🔧 P1-19 fix: 旧代码各组件独立用 toLocaleString / toFixed / 字符串拼接,
 *   导致金额格式不统一 ($23196 vs $23,195.99).
 *   修复: 统一 formatCurrency, 全应用导入使用.
 *
 * 🔧 P1-1 fix: 货币符号根据语言自动切换
 *   - 中文 (zh): ¥ 符号, CNY 货币, 2 位小数 (≥1000 时 0 位)
 *   - 英文 (en): $ 符号, USD 货币, 2 位小数 (≥1000 时 0 位)
 *   - 默认: $ (USD)
 */

/** 获取当前 locale — 运行时从 localStorage 读取, 避免循环依赖 i18n provider */
function getCurrentLocale(): 'en' | 'zh' {
  if (typeof window === 'undefined') return 'en';
  try {
    const saved = localStorage.getItem('symy-locale');
    if (saved === 'zh') return 'zh';
    if (saved === 'en') return 'en';
  } catch { /* silent */ }
  // 检测浏览器语言
  const browserLangs = navigator.languages || [navigator.language];
  for (const lang of browserLangs) {
    const code = lang.toLowerCase().split('-')[0];
    if (code === 'zh') return 'zh';
    if (code === 'en') return 'en';
  }
  return 'en';
}

/** 根据 locale 获取货币配置 */
function getCurrencyConfig(locale: 'en' | 'zh'): { currency: string; locale: string } {
  return locale === 'zh'
    ? { currency: 'CNY', locale: 'zh-CN' }
    : { currency: 'USD', locale: 'en-US' };
}

/**
 * 格式化金额为货币字符串 (根据当前 locale 自动切换 $ / ¥)
 *
 * @param amount 金额数值
 * @param options 选项
 *   - decimals: 是否显示小数 (默认 true). 金额 ≥ 1000 时建议 false (更简洁), < 100 时 true (精确)
 *   - withSign: 是否显示正负号 (默认 false)
 *
 * @returns 格式化后的字符串, 如 "$1,234.56" / "¥1,234.56" 或 "$1,234" / "¥1,234"
 *
 * @example
 * formatCurrency(23195.99) // "$23,195.99" (en) or "¥23,195.99" (zh)
 * formatCurrency(23195.99, { decimals: false }) // "$23,196" (en) or "¥23,196" (zh)
 * formatCurrency(89) // "$89.00" (en) or "¥89.00" (zh)
 * formatCurrency(-50) // "-$50.00" (en) or "-¥50.00" (zh)
 */
export function formatCurrency(
  amount: number | null | undefined,
  options: { decimals?: boolean; withSign?: boolean } = {},
): string {
  const { decimals = true, withSign = false } = options;

  // 🔧 Safe guard: null/undefined/NaN 返回 "¥0" 或 "$0"
  const locale = getCurrentLocale();
  const zeroStr = locale === 'zh' ? '¥0' : '$0';
  if (amount == null || isNaN(amount)) return zeroStr;

  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : (withSign ? '+' : '');

  // 🔧 P1-1 fix: 根据 locale 切换货币符号
  const { currency, locale: intlLocale } = getCurrencyConfig(locale);

  // 用 Intl.NumberFormat 统一格式化 (含千位分隔符)
  const formatter = new Intl.NumberFormat(intlLocale, {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  });

  return `${sign}${formatter.format(abs)}`;
}

/**
 * 格式化金额为简短形式 (用于空间受限的 UI, 如卡片标题)
 * 根据 locale 自动切换 $ / ¥
 *
 * @example
 * formatCurrencyShort(1234) // "$1.2K" (en) or "¥1.2K" (zh)
 * formatCurrencyShort(1234567) // "$1.2M" (en) or "¥1.2M" (zh)
 * formatCurrencyShort(89) // "$89" (en) or "¥89" (zh)
 */
export function formatCurrencyShort(amount: number | null | undefined): string {
  const locale = getCurrentLocale();
  const symbol = locale === 'zh' ? '¥' : '$';
  if (amount == null || isNaN(amount)) return `${symbol}0`;
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (abs >= 1_000_000) {
    return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}${symbol}${(abs / 1_000).toFixed(1)}K`;
  }
  return `${sign}${symbol}${abs.toFixed(0)}`;
}

/**
 * 格式化数字 (不带货币符号), 用于 tokens / count 等纯数字
 *
 * @example
 * formatNumber(1234) // "1,234"
 * formatNumber(89) // "89"
 */
export function formatNumber(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '0';
  return new Intl.NumberFormat('en-US').format(n);
}
