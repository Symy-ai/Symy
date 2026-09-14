# Symy hands deployment

This stack runs the stateless Symy hands MCP service behind Caddy and a named Cloudflare Tunnel. Public requests reach `https://hands.symy.ai`, Cloudflare forwards them to `cloudflared`, and Caddy forwards authenticated MCP traffic to `hands:8080`.

## Prerequisites

- Docker and Docker Compose
- `symy-hands:latest` built from the read-only Symy source:

```bash
cd /home/spark/src/github/Symy-ai/Shopping/src
docker build -t symy-hands:latest .
```

- The named Cloudflare tunnel `symy-hands` and its DNS route for `hands.symy.ai`.

## Configure and run

```bash
cd deploy/hands
cp .env.example .env
openssl rand -hex 32  # SYMY_HANDS_SECRET
cloudflared tunnel token symy-hands  # CLOUDFLARE_TUNNEL_TOKEN
docker compose up -d
```

The deployment currently uses the in-process cart stub because the Supabase service key was not supplied. To switch to durable Supabase carts after the owner manually applies `supabase/migrations/139_cart_lines.sql`, set:

```dotenv
SYMY_CART_PROVIDER=supabase
SYMY_SUPABASE_URL=https://fcgpxrujhnqramggupjm.supabase.co
SYMY_SUPABASE_KEY=<service-key>
```

Then run `docker compose up -d --force-recreate hands`.

Caddy permits an MCP request only when either header exactly matches:

- `Authorization: Bearer $SYMY_HANDS_SECRET`
- `X-MCP-Secret: $SYMY_HANDS_SECRET`

Any other value, including a missing or incorrect bearer token, returns `401`.

## Health monitoring

Run the local probe manually or from cron:

```bash
scripts/hands-health-probe.sh
```

For external monitoring, register `https://hands.symy.ai/health` in a service such as Better Stack, UptimeRobot, or StatusCake. Account and recipient registration must be completed by the owner.

The public health endpoint is intentionally unauthenticated so generic uptime monitors can check it. MCP operations remain protected by the exact-header checks above.

