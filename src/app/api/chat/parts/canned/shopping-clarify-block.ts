/**
 * 🐘 shopping-clarify 三态短路块（b137 拆解第21刀，自 route.ts:349-369 纯机械搬移）
 *
 * 购物意图澄清: 意图不明 ("买点给孩子的东西") → 不调 Letta, 直接 canned 追问轮 +
 * 澄清卡 (recipient/category/timing 三槽位); 意图无需澄清时放行, 但判定为
 * not_purchase (非购买闲聊) 时产出 suppressGuardCards 旗标, 下游守护卡
 * (emotion-guard / context-signal / loadLettaTurnContext 通用预检) 全静默。
 *
 * 返回三态 —— 对 canned `Response | null` 惯例的唯一扩展 (clarify 除短路外
 * 还产出副作用旗标, route 侧以 ShoppingClarifyBlockResult 对象承载):
 * ① response 非 null = 短路 (clarify 追问轮, route 直接 return, 旗标恒 false)
 * ② response null + suppressGuardCards=true = 直通 + 旗标 (意图判 not_purchase)
 * ③ response null + suppressGuardCards=false = 未命中直通 (内部异常 catch 兜底同此态)
 *
 * 链序敏感: 必须在 emotion-guard 块之前 (suppressGuardCards 消费方在后),
 * 由 route-structure-lock.test.ts source-order 锁定。
 */
import { NextResponse } from 'next/server';

interface ShoppingClarifyBlockInput {
  userContent: string;
  locale: 'zh' | 'en';
  stream?: boolean;
  askedSubjects?: readonly string[];
  mergeCookies: (res: NextResponse) => NextResponse;
  mergeCookiesOnResponse: (res: Response) => Response;
  SSE_HEADERS: Record<string, string>;
}

export interface ShoppingClarifyBlockResult {
  /** 非 null = 短路 Response (clarify 追问轮), route 直接 return */
  response: Response | null;
  /** 副作用旗标: true = 意图判 not_purchase, 下游守护卡全静默 */
  suppressGuardCards: boolean;
  /** 快问卡应答转译后的自然语言意图; 未命中机器应答时 undefined */
  effectiveUserContent?: string;
}

export async function tryShoppingClarifyBlock(input: ShoppingClarifyBlockInput): Promise<ShoppingClarifyBlockResult> {
  const { userContent, locale, stream = false, askedSubjects = [], mergeCookies, mergeCookiesOnResponse, SSE_HEADERS } = input;
  try {
    const { buildShoppingClarifyTurn, buildShoppingClarifySseStream, shoppingClarifyAnswerToIntent } = await import('../shopping-clarify-turn');
    const { classifyShoppingIntent } = await import('@/lib/shopping-intent-clarify');

    const clarifiedIntent = shoppingClarifyAnswerToIntent(userContent, locale);
    if (clarifiedIntent) {
      return { response: null, suppressGuardCards: false, effectiveUserContent: clarifiedIntent };
    }

    const clarification = buildShoppingClarifyTurn({ userContent, locale, askedSubjects });
    const intent = clarification ? undefined : classifyShoppingIntent({ message: userContent, locale, askedSubjects });
    if (clarification) {
      if (stream) {
        return {
          response: mergeCookiesOnResponse(new Response(buildShoppingClarifySseStream(clarification), { headers: { ...SSE_HEADERS } })),
          suppressGuardCards: false,
        };
      }
      return {
        response: mergeCookies(NextResponse.json({
          reply: clarification.reply,
          reasoning: undefined,
          toolCalls: undefined,
          shoppingClarifyCard: clarification.shoppingClarifyCard,
        })),
        suppressGuardCards: false,
      };
    }
    return { response: null, suppressGuardCards: intent?.confidence === 'not_purchase' };
  } catch {
    // safe to ignore: 原内联段同款兜底 — clarify 判定器抛错时按未命中处理
    // (旗标 false + 直通), 链路继续走通用聊天, 绝不因澄清器故障阻断对话
    return { response: null, suppressGuardCards: false };
  }
}
