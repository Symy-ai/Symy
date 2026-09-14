-- ============================================================
-- seed.sql — Supabase Cron 设置 + 初始数据
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 设置 pg_cron: 每天凌晨2点调用 daily-stats Edge Function
-- 注意: 需要先在 Dashboard → Database → Extensions 启用 pg_cron
select cron.schedule(
    'daily-stats',
    '0 2 * * *',
    $$
    select net.http_post(
        url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/daily-stats',
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || current_setting('app.cron_secret', true),
            'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
    );
    $$
);
