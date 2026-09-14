# 本地服务固化（systemd 单元）

WSL 死机/重启后，本地手拉的服务全没了。本目录把它们固化成 systemd 单元，开机自启、崩溃自动拉起，一次安装永久生效：

- **symy-search.service** — 检索服务，`:8010`（Milvus 商品目录检索，`/health`）
- **symy-orch.service** — orchestrator，`:8082`（LangGraph agent + `/img` 图床代理）
- **Milvus 三容器** — `restart=unless-stopped`，随 docker.service 自启

运行时依赖（不在本仓库、不归本目录管）：

- `/home/spark/runtime/Shopping-AI/` — search / orchestrator 源码 + `platform/configs` + 密钥文件 `.env`
- `/home/spark/venvs/{search,orch}` — 持久 venv（由 `setup-venvs.sh` 创建，WSL 重启不丢，替代以前放在 /tmp 的临时 venv）

## 架构

```
        GLM 脑（open.bigmodel.cn，LangGraph/agent 侧）
             │  MCP over https://hands.symy.ai/mcp/（cloudflared 隧道）
             ▼
  ┌──────────────────────────────────────────────┐
  │ hands（docker compose，deploy/hands/）        │
  │   symy-hands + caddy + cloudflared           │
  │   SYMY_CATALOG_BASE_URL=http://host.docker.internal:8010     ──┐
  │   SYMY_IMAGE_PROXY_BASE → 图床（host :8082）  ──────────────┐  │
  └──────────────────────────────────────────────┘            │  │
                                                              │  │
   ┌───────────────────────────────────────────────────────────┼──┘
   │                                                           │
   ▼                                                           ▼
 symy-search.service (:8010)                      symy-orch.service (:8082)
   uvicorn search/app                                uvicorn orchestrator/app
     │            │                                     │              │
     │            └─ EMBED_*（智谱 embedding）           │              └─ /img 图床代理：
     ▼                                                │                 反盗链域名
 Milvus（docker 三容器）                               ▼                 (yiwugo/ddimg/piaojia)
   milvus-etcd → milvus-minio                    LLM_API_KEY          由 hands/前端加载，
   → milvus-standalone (:19530/:9091)            (open.bigmodel.cn)   免直接热链
```

调用链：脑 → hands(MCP) → search(:8010) → Milvus；图片链路：商品图 URL 被改写为 `:8082/img?...`，由 orchestrator 中转拉取外部图床。

不在此范围：memory(:8011)、safety(:8012) 未由 systemd 接管（orchestrator 的 config-local.yaml 引用了它们，缺省时部分功能降级）。

## 安装（幂等，可重复跑）

```bash
cd /home/spark/src/github/WeAreAllMe/deploy/local-services
sudo bash install.sh        # 或 spark 用户 + sudo 免密时直接 bash install.sh
```

install.sh 依次：建 venv → `docker update --restart unless-stopped` 三个 milvus 容器（停着就拉起，等 healthz）→ 拷贝单元到 `/etc/systemd/system/` → `daemon-reload` + `enable` + `restart` → 打印 8010/8082 健康状态。重复执行安全（venv 复用、restart 策略重复设置无副作用、单元重启即生效新配置）。

单独跑某一步：

```bash
bash setup-venvs.sh          # 建/同步 venv；--force 删掉重建
bash start-search.sh         # 手动前台跑 search（同单元内 ExecStart）
bash start-orch.sh           # 手动前台跑 orchestrator
```

## 日常运维

```bash
systemctl status symy-search symy-orch
journalctl -u symy-search -u symy-orch -f      # 日志（journald）
systemctl restart symy-search                  # 改了 config-local.yaml/.env 之后
```

## 行为说明

- 单元 `Restart=always, RestartSec=5`：Milvus 还没起来时 search 会崩几次然后自愈，属预期。
- 密钥不进仓库：单元用 `EnvironmentFile=/home/spark/runtime/Shopping-AI/.env` 引用；`OPENAI_API_KEY=$LLM_API_KEY` 的映射在 `start-orch.sh` 里做（systemd 不展开变量）。
- WSL 代理污染：两个包装脚本都 `unset` 全套 proxy 并设 `NO_PROXY=localhost,127.0.0.1,open.bigmodel.cn`。
- WSL 重启后的自愈顺序：docker.service → Milvus 容器（unless-stopped）→ hands compose（unless-stopped）→ 本目录两单元（multi-user.target，`After=docker.service`）。
- 端口约定：search `:8010`、orchestrator `:8082`（Docker 版默认 8009，本地刻意分开）。
