// supabase/functions/daily-stats/index.ts
// Edge Function: 每日统计汇总
// 部署: npx supabase functions deploy daily-stats
// Cron: 0 2 * * * (每天凌晨2点)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  // 验证请求来源（防止外部随意调用）
  // 🔧 ARCH fix (Round 3 安全审计 C3 — fail-open when CRON_SECRET unset):
  //    旧代码: if (expectedToken && authHeader !== ...) → 若 CRON_SECRET 未配置, && 短路, 任何人可调用。
  //    根因修复: 改为 ||, 若 secret 未配置或 不匹配 都拒绝。
  const authHeader = req.headers.get("Authorization");
  const expectedToken = Deno.env.get("CRON_SECRET");
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split("T")[0];

  // 获取所有用户
  const { data: users, error: usersError } = await supabase
    .from("profiles")
    .select("id");
  if (usersError) {
    return new Response(JSON.stringify({ error: usersError.message }), { status: 500 });
  }

  let processed = 0;

  for (const user of users!) {
    // 汇总该用户昨天的冲动事件
    const { data: events } = await supabase
      .from("impulse_events")
      .select("amount, impulse_score")
      .eq("user_id", user.id)
      .gte("created_at", dateStr)
      .lt("created_at", `${dateStr}T23:59:59`);

    // 汇总该用户昨天确认的退款
    const { data: refunds } = await supabase
      .from("refund_requests")
      .select("refund_amount")
      .eq("user_id", user.id)
      .eq("status", "confirmed")
      .gte("created_at", dateStr)
      .lt("created_at", `${dateStr}T23:59:59`);

    // 写入 daily_stats (upsert 防重复)
    await supabase.from("daily_stats").upsert(
      {
        user_id: user.id,
        date: dateStr,
        total_events: events?.length || 0,
        impulse_count: events?.filter((e) => e.impulse_score > 60).length || 0,
        total_amount: events?.reduce((s, e) => s + (e.amount || 0), 0) || 0,
        refund_count: refunds?.length || 0,
        saved_amount: refunds?.reduce((s, r) => s + (r.refund_amount || 0), 0) || 0,
      },
      { onConflict: "user_id,date" }
    );

    // 更新用户画像的 avg_amount (最近50笔)
    const { data: allEvents } = await supabase
      .from("impulse_events")
      .select("amount")
      .eq("user_id", user.id)
      .not("amount", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);

    if (allEvents && allEvents.length > 0) {
      const avg = allEvents.reduce((s, e) => s + e.amount, 0) / allEvents.length;
      await supabase.from("profiles").update({ avg_amount: avg, updated_at: new Date().toISOString() }).eq("id", user.id);
    }

    processed++;
  }

  return new Response(
    JSON.stringify({ date: dateStr, users_processed: processed }),
    { headers: { "Content-Type": "application/json" } }
  );
});
