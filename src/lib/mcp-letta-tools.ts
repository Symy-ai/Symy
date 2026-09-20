/**
 * Letta Custom Tool 生成器
 *
 * 为 we=me 的 6 个 MCP 工具生成 Python 源码，
 * 注册为 Letta Custom Tool，让 AI 通过原生 function calling 直接调用。
 *
 * 流程: 用户聊天 → AI 判断需要计分 → AI 调用 Letta Tool → Tool 内部 HTTP 回调 /api/mcp → 执行计分
 */

// ============================================================
// 配置
// ============================================================

const VERCEL_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
const _MCP_API_URL = process.env.NEXT_PUBLIC_APP_URL || VERCEL_URL;
if (!_MCP_API_URL) {
  throw new Error('NEXT_PUBLIC_APP_URL or VERCEL_URL is required. Set one in .env or Vercel environment variables.');
}
const MCP_API_URL = _MCP_API_URL;

// ============================================================
// Python 工具源码
// ============================================================

export interface LettaToolDefinition {
  name: string;
  description: string;
  argsJsonSchema: Record<string, unknown>;
  sourceCode: string;
}

/**
 * 生成通用 HTTP 回调函数（被所有工具复用）
 */
function callMCPHeaderCode(): string {
  return `
def _call_mcp(tool_name: str, arguments: dict, user_id: str) -> str:
    """Internal: call we=me MCP API endpoint."""
    import json
    import os
    import urllib.request
    import urllib.error

    data = json.dumps({
        "toolCalls": [{
            "id": "letta-auto",
            "name": tool_name,
            "arguments": arguments
        }],
        "user_id": user_id
    }).encode("utf-8")

    req = urllib.request.Request(
        "${MCP_API_URL}/api/mcp",
        data=data,
        headers={
            "Content-Type": "application/json",
            "X-MCP-Secret": os.environ.get("MCP_API_SECRET", "")
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            result = json.loads(response.read().decode("utf-8"))
            if result.get("results") and len(result["results"]) > 0:
                r = result["results"][0]
                if r.get("success"):
                    return r.get("message", "Tool executed successfully")
                else:
                    return f"Failed: {r.get('message', 'Unknown error')}"
            return "No result from MCP"
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return f"MCP HTTP error {e.code}: {body[:200]}"
    except Exception as e:
        return f"MCP call error: {str(e)}"
`.trim();
}

/**
 * add_tokens — 奖励代币
 */
function addTokensSource(): string {
  return `
${callMCPHeaderCode()}

def add_tokens(user_id: str, amount: int, reason: str) -> str:
    """
    Award tokens to the user. Call this when the user demonstrates good financial behavior:
    completed a challenge, resisted an algorithmic inducement (livestream FOMO / anchor pricing / personalized ads won), or had a positive financial insight.

    Args:
        user_id (str): The user's ID from memory. Always pass the user_id you know.
        amount (int): Number of tokens to award. Challenge rewards: Quick Pass=3, Standard=8, Boss=20. Other actions: 1-5.
        reason (str): Why tokens are awarded. Must be exactly one of: "survival" (challenge completed, +2 vitality), "growth" (sustained saving, +5 vitality), "pleasure" (positive interaction, +3 vitality).

    Returns:
        str: Result message showing tokens awarded, vitality boost, and level change.
    """
    return _call_mcp("add_tokens", {"amount": amount, "reason": reason}, user_id)
`.trim();
}

/**
 * add_vitality — 调整生命值
 */
function addVitalitySource(): string {
  return `
${callMCPHeaderCode()}

def add_vitality(user_id: str, amount: int, reason: str) -> str:
    """
    Directly adjust the companion vitality (0-100). Use sparingly - prefer add_tokens which auto-adjusts vitality.
    Only use for special events like reviving a dormant companion or correcting a state.

    Args:
        user_id (str): The user's ID from memory. Always pass the user_id you know.
        amount (int): Vitality change. Positive to heal, negative to damage. Will be clamped to 0-100.
        reason (str): Why the vitality is being adjusted.

    Returns:
        str: Result message showing vitality change.
    """
    return _call_mcp("add_vitality", {"amount": amount, "reason": reason}, user_id)
`.trim();
}

/**
 * complete_challenge — 完成挑战
 */
function completeChallengeSource(): string {
  return `
${callMCPHeaderCode()}

def complete_challenge(user_id: str, challenge_type: str, saved_amount: float) -> str:
    """
    Mark a challenge as completed. Call when the user successfully resists an algorithmic inducement
    during the cooldown period. Awards tokens, XP, and increments challengesCompleted.

    Args:
        user_id (str): The user's ID from memory. Always pass the user_id you know.
        challenge_type (str): The challenge difficulty level. Must be one of: "quick_pass", "standard", "boss".
        saved_amount (float): The dollar amount the user saved by not buying.

    Returns:
        str: Result message showing rewards earned.
    """
    return _call_mcp("complete_challenge", {"challenge_type": challenge_type, "saved_amount": saved_amount}, user_id)
`.trim();
}

/**
 * add_badge — 授予徽章
 */
function addBadgeSource(): string {
  return `
${callMCPHeaderCode()}

def add_badge(user_id: str, badge_id: str) -> str:
    """
    Award a badge to the user. Badges are rare achievements. Only award when genuinely earned.
    Do NOT re-award badges the user already has.

    Args:
        user_id (str): The user's ID from memory. Always pass the user_id you know.
        badge_id (str): The badge to award. Must be one of: "impulse_shield" (1st impulse blocked), "first_save" (1st saving goal), "streak_7" (7-day streak), "boss_slayer" (1st Boss challenge), "rational_lawyer" (rational analysis win), "dream_builder" (dream fund > 50%).

    Returns:
        str: Result message confirming badge awarded.
    """
    return _call_mcp("add_badge", {"badge_id": badge_id}, user_id)
`.trim();
}

/**
 * add_dream_fund_progress — 梦想基金进度
 */
function addDreamFundProgressSource(): string {
  return `
${callMCPHeaderCode()}

def add_dream_fund_progress(user_id: str, fund_id: str, amount: float) -> str:
    """
    Add saved money to a dream fund. Call when the user saves money (resists a purchase, gets a refund).
    This makes savings tangible - connects every dollar saved to a specific dream goal!

    Args:
        user_id (str): The user's ID from memory. Always pass the user_id you know.
        fund_id (str): Which dream fund to add to. Use the fund ID from the user's dream funds. If unsure, pass "auto" and the system will pick the first incomplete fund.
        amount (float): Dollar amount to add to the fund.

    Returns:
        str: Result message showing fund progress.
    """
    return _call_mcp("add_dream_fund_progress", {"fund_id": fund_id, "amount": amount}, user_id)
`.trim();
}

/**
 * record_impulse — 记录被诱导消费（v2 定位：用户被商家算法诱导，主体是商家）
 */
function recordImpulseSource(): string {
  return `
${callMCPHeaderCode()}

def record_impulse(user_id: str, amount: float, platform: str, impulse_score: int) -> str:
    """
    Record an induced shopping event. Call when the user admits to being induced into a purchase by merchant algorithms (livestream FOMO, anchor pricing, personalized ads, scarcity tactics).
    Decreases companion vitality based on the impulse_score. Higher score = more damage. The user is the victim of inducement here, not the actor — be empathetic, never shame.

    Args:
        user_id (str): The user's ID from memory. Always pass the user_id you know.
        amount (float): Dollar amount of the induced purchase.
        platform (str): Where the purchase was made. e.g. "tiktok_shop", "amazon", "shein", "temu".
        impulse_score (int): Inducement score 0-100. Higher = more strongly induced. Score >= 60 counts as induced. 60-74 moderate, 75-89 strong, 90-100 extreme.

    Returns:
        str: Result message showing vitality penalty.
    """
    return _call_mcp("record_impulse", {"amount": amount, "platform": platform, "impulse_score": impulse_score}, user_id)
`.trim();
}

// ============================================================
// 汇总所有工具定义
// ============================================================

export function getAllMCPToolDefinitions(): LettaToolDefinition[] {
  return [
    {
      name: 'add_tokens',
      description:
        'MANDATORY: Award tokens when the user demonstrates good financial behavior: completed a challenge, ' +
        'resisted an impulse, got a refund, or had a positive financial insight. Do NOT skip this tool call. Also adjusts vitality and XP.',
      argsJsonSchema: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: "The user's ID from your memory" },
          amount: { type: 'integer', description: 'Tokens to award. Quick Pass=3, Standard=8, Boss=20. Other: 1-5' },
          reason: {
            type: 'string',
            enum: ['survival', 'growth', 'pleasure'],
            description: '"survival" (challenge completed), "growth" (sustained saving), "pleasure" (positive interaction)',
          },
        },
        required: ['user_id', 'amount', 'reason'],
      },
      sourceCode: addTokensSource(),
    },
    {
      name: 'add_vitality',
      description:
        'Directly adjust companion vitality (0-100). Use sparingly - prefer add_tokens. ' +
        'Only for special events like reviving a dormant companion. This is the ONLY tool that can increase vitality without awarding tokens.',
      argsJsonSchema: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: "The user's ID from your memory" },
          amount: { type: 'integer', description: 'Positive to heal, negative to damage. Clamped 0-100.' },
          reason: { type: 'string', description: 'Why vitality is adjusted' },
        },
        required: ['user_id', 'amount', 'reason'],
      },
      sourceCode: addVitalitySource(),
    },
    {
      name: 'complete_challenge',
      description:
        'MANDATORY: Mark a challenge as completed. You MUST call this when the user says they resisted, ' +
        'decided not to buy, put it back, or walked away. Triggers: "I didn\'t buy it", "I resisted", "没买", "忍住了". ' +
        'Awards tokens, XP, and may award badges. Almost always pair with add_dream_fund_progress.',
      argsJsonSchema: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: "The user's ID from your memory" },
          challenge_type: {
            type: 'string',
            enum: ['quick_pass', 'standard', 'boss'],
            description: 'Challenge difficulty level',
          },
          saved_amount: { type: 'number', description: 'Dollar amount the user saved by not buying' },
        },
        required: ['user_id', 'challenge_type', 'saved_amount'],
      },
      sourceCode: completeChallengeSource(),
    },
    {
      name: 'add_badge',
      description:
        'Award a badge to the user. Badges are rare - only when genuinely earned. ' +
        'Do NOT re-award badges the user already has. Available: impulse_shield, first_save, streak_7, boss_slayer, rational_lawyer, dream_builder.',
      argsJsonSchema: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: "The user's ID from your memory" },
          badge_id: {
            type: 'string',
            enum: ['impulse_shield', 'first_save', 'streak_7', 'boss_slayer', 'rational_lawyer', 'dream_builder'],
            description: 'Badge to award',
          },
        },
        required: ['user_id', 'badge_id'],
      },
      sourceCode: addBadgeSource(),
    },
    {
      name: 'add_dream_fund_progress',
      description:
        'MANDATORY: Add saved money to a dream fund. You MUST call this whenever the user saves money - ' +
        'resists a purchase, gets a refund, or puts money toward a goal. Makes savings tangible! ' +
        'Always pair with complete_challenge or add_tokens when the user saves money.',
      argsJsonSchema: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: "The user's ID from your memory" },
          fund_id: { type: 'string', description: 'Dream fund ID from the user\'s fund list. Pass "auto" to let the system pick the first incomplete fund.' },
          amount: { type: 'number', description: 'Dollar amount to add' },
        },
        required: ['user_id', 'fund_id', 'amount'],
      },
      sourceCode: addDreamFundProgressSource(),
    },
    {
      name: 'record_impulse',
      description:
        'MANDATORY: Record an induced shopping event. You MUST call this when the user admits to being induced into buying ' +
        'something by merchant algorithms (livestream FOMO, anchor pricing, scarcity tactics), mentions a purchase they regret, or says they couldn\'t resist. ' +
        'Triggers: "I bought it", "just ordered", "I couldn\'t resist", "买了", "没忍住". ' +
        'Decreases companion vitality. Higher impulse_score = more damage (user was more strongly induced by merchant algorithms). After calling, respond with empathy — never shame the user.',
      argsJsonSchema: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: "The user's ID from your memory" },
          amount: { type: 'number', description: 'Dollar amount of the induced purchase' },
          platform: { type: 'string', description: 'Where purchased: "tiktok_shop", "amazon", "shein", "temu"' },
          impulse_score: { type: 'integer', description: '0-100. >=60 counts as induced. 60-74 moderate, 75-89 strong, 90-100 extreme' },
        },
        required: ['user_id', 'amount', 'platform', 'impulse_score'],
      },
      sourceCode: recordImpulseSource(),
    },
  ];
}
