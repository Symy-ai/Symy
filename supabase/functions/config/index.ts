// supabase/functions/config/index.ts
// Edge Function: 安全下发 App 配置给已认证用户
// 部署: npx supabase functions deploy config
// 客户端调用: GET /functions/v1/config (带 Authorization header)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "GET") {
    return new Response("method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // 验证用户身份
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("missing authorization", { status: 401 });
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (error || !user) {
    return new Response("unauthorized", { status: 401 });
  }

  // 读取所有配置
  const { data, error: dbError } = await supabase
    .from("app_config")
    .select("key, value");

  if (dbError) {
    return new Response(JSON.stringify({ error: dbError.message }), { status: 500 });
  }

  // 转为 key-value 对象返回
  const config = Object.fromEntries(data!.map((r) => [r.key, r.value]));

  return new Response(JSON.stringify(config), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300", // 缓存5分钟
    },
  });
});
