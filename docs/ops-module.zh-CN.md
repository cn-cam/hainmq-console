# 运维模块配置指南

本文档说明海心云 MQ 管理台运维模块的部署、权限、监控、告警、MCP 和模型对话配置。

## 1. 架构与限制

运维模块不引入 PostgreSQL、独立 Worker、Redis 或额外常驻容器。它复用现有 Next.js 单进程架构：

- 数据存储在嵌入式 SQLite：`/app/data/ops.db`（本地开发为 `./data/ops.db`）。
- 采集、规则评估和通知发送在 Next.js 进程内通过 `instrumentation.ts` 调度。
- **仅支持单实例部署**。多副本会重复采集、重复告警。
- 应用停止期间不会采集和告警；重启后恢复，未发送的通知会重试。
- 现有海心云 MQ 管理台页面不受影响。

## 2. 前置条件

- RabbitMQ 已启用 `rabbitmq_management` 插件，且 Management API（默认 `15672`）可达。
- Node.js 24（仅本地运行需要）或 Docker。
- 一个用于后台采集的只读 RabbitMQ 账号（建议 `monitoring` tag）。
- 用于登录 `/ops` 的 RabbitMQ 账号需要以下 tag 之一：
  - `administrator`：运维管理员，可配置目标、规则、通道、模型和审批写操作。
  - `policymaker` / `management`：操作员，可查看、确认/静默告警、审批写操作。
  - `monitoring`：只读。

默认 `OPS_ADMIN_USERS=administrator`，只有该 RabbitMQ 用户可以管理运维配置。需要多个管理员时写成 `OPS_ADMIN_USERS=alice,bob`；留空表示所有 `administrator` 都可以管理。不在名单内的 `administrator` 会降级为操作员。

## 3. 创建只读 RabbitMQ 账号

在 RabbitMQ 中创建一个只读账号，例如：

```bash
rabbitmqctl add_user hainmq-monitor 'change-me'
rabbitmqctl set_user_tags hainmq-monitor monitoring
rabbitmqctl set_permissions -p / hainmq-monitor '^$' '^$' '.*'
```

说明：

- `configure` 为空，避免该账号创建资源。
- `read` 允许读取队列/交换机/连接等信息。
- `write` 为空，避免发布消息。
- 如果监控多个 Vhost，请分别授权。

后台采集只使用这个账号，不使用浏览器登录用户，因此即使没有用户在线也能持续监控。

## 4. Docker Compose 部署

复制环境变量示例：

```bash
cp .env.ops.example .env
```

生成加密密钥和 MCP Token：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

编辑 `.env`：

```env
RABBITMQ_HOST=host.docker.internal
RABBITMQ_PORT=15672
RABBITMQ_PROTOCOL=http

OPS_RABBITMQ_USERNAME=hainmq-monitor
OPS_RABBITMQ_PASSWORD=change-me

OPS_ENCRYPTION_KEY=<上一步生成的 base64 密钥>
OPS_MCP_TOKEN=<上一步生成的 hex token>

OPS_MCP_ALLOW_WRITE=true
OPS_MCP_ALLOW_PEEK=false
OPS_MCP_ALLOWED_VHOSTS=/
OPS_POLL_INTERVAL_MS=60000
OPS_WEBHOOK_ALLOW_PRIVATE=false
OPS_ADMIN_USERS=administrator
OPS_CHAT_ENABLED=true
```

启动：

```bash
docker compose up -d --build
```

访问 `http://localhost:3000/ops`，使用 RabbitMQ 账号登录。

> 如果 RabbitMQ 在宿主机上，Docker 容器内不能用 `localhost`；Compose 默认使用 `host.docker.internal`，Linux 已配置 `host-gateway`。

### 本地开发

```bash
cp .env.ops.example .env
# 本地运行时把 RABBITMQ_HOST 改为 localhost
npm install
npm run dev
```

本地开发时 `OPS_DB_PATH` 可省略，默认写入 `./data/ops.db`。

## 5. 监控目标

首次启动时，如果数据库中没有目标，且设置了 `OPS_RABBITMQ_USERNAME` / `OPS_RABBITMQ_PASSWORD`，系统会自动创建一个名为 `Default` 的目标。

> 注意：默认目标只在数据库没有目标时从环境变量创建。之后修改 `OPS_RABBITMQ_USERNAME` / `OPS_RABBITMQ_PASSWORD` 不会自动更新已保存的目标；请在 `/ops/targets` 编辑目标凭据，或删除目标后重启容器重新创建。

也可以在 `/ops/targets` 手动添加多个目标：

- 名称
- RabbitMQ 主机
- Management 端口
- 协议（http/https）
- Vhost 范围（留空表示全部）
- 采集用户名/密码
- 启用状态

目标密码使用 `OPS_ENCRYPTION_KEY` 加密存储，接口不会回显。

## 6. 通知通道

在 `/ops/channels` 配置多个邮件和 Webhook 通道。

### 邮件

字段：

- SMTP Host / Port
- TLS/SSL
- 用户名 / 密码
- From / From Name
- 收件人、抄送、Reply-To

密码加密存储。编辑时留空表示保留原密码。保存后可点击“测试”发送测试邮件。

### Webhook

字段：

- URL
- Method（POST/PUT/PATCH）
- Headers（JSON）
- Body 模板（可选）
- 超时、重试次数
- HMAC 密钥（可选）
- 是否允许内网地址

默认发送通用 JSON：

```json
{
  "event": "alert",
  "title": "[告警] 队列积压",
  "message": "队列积压触发：orders.created 当前值 225400，阈值 10000",
  "severity": "warning",
  "status": "firing",
  "target": "Default",
  "objectType": "queue",
  "objectName": "orders.created",
  "metric": "queue.messages_ready",
  "value": 225400,
  "threshold": 10000,
  "startedAt": "2026/10/28 12:43:07",
  "resolvedAt": null,
  "timestamp": "2026-10-28T04:43:07.442Z"
}
```

自定义 Body 模板支持变量：

```json
{"text":"{{title}} - {{message}}","severity":"{{severity}}"}
```

设置 HMAC 密钥后，请求会带：

```text
X-HainMQ-Signature: sha256=<hex>
```

签名内容是请求体原文。接收端应使用相同密钥校验。

### 内网 Webhook 与 SSRF

默认禁止访问回环、RFC1918 内网和云元数据地址。内网部署需要访问内网 Webhook 时：

- 全局设置 `OPS_WEBHOOK_ALLOW_PRIVATE=true`，或在 `/ops/settings` 打开“允许内网地址”。
- 也可以在单个 Webhook 通道打开 `allowPrivate`。

请只在你信任的网络中使用该选项。

## 7. 告警规则

在 `/ops/rules` 新建规则。首次启动会生成一批默认规则（通知通道为空，需要手动绑定）：

- RabbitMQ 服务不可达
- 内存告警 / 磁盘告警
- 队列有消息但无消费者
- 队列就绪消息积压
- 队列未确认消息过多
- 不可路由消息增长

规则字段：

- 目标
- 范围：全局 / 队列 / 交换机
- 范围值：`*` 表示全部，或以 `*` 结尾表示前缀匹配
- 指标
- 比较方式：`>` `>=` `<` `<=` `==` `!=`
- 阈值
- 持续时间：条件持续满足多少秒才触发
- 严重级别
- 通知通道（可多选）
- 冷却时间：告警持续期间重复通知的间隔
- 启用状态

告警生命周期：

- `pending`：条件满足但未达到持续时间。
- `firing`：已触发，按规则发送通知。
- `resolved`：条件恢复，发送恢复通知（如配置）。
- 支持确认、静默 1 小时、手动恢复。

通知失败会重试，最多 5 次，退避时间最长 5 分钟。投递记录可在告警详情中查看。

## 8. MCP 与本地 opencode

### 8.1 MCP Token

设置 `OPS_MCP_TOKEN`。MCP 请求使用：

```text
Authorization: Bearer <OPS_MCP_TOKEN>
```

MCP 接口已加入免登录路径，但会校验 Bearer Token。

### 8.2 写操作

- `OPS_MCP_ALLOW_WRITE=false` 时，写工具直接拒绝。
- `OPS_MCP_ALLOW_WRITE=true`（默认）时，写工具不会立即执行，而是创建审批。
- 审批人在 `/ops/approvals` 批准后，服务端使用**审批人当前浏览器会话的 RabbitMQ 凭据**执行操作。
- 支持 Vhost 白名单 `OPS_MCP_ALLOWED_VHOSTS`（默认 `/`，`*` 表示全部）。
- 可选队列前缀白名单 `OPS_MCP_QUEUE_PREFIXES`，例如 `orders.,payments.`。
- 所有写操作和审批都会写入审计日志，审计详情中的密码/Token/消息体会被脱敏。
- `OPS_MCP_ALLOW_PEEK=false`（默认）时，`mq_peek_messages` 会被拒绝，避免消息体进入模型上下文；需要时显式设为 `true`。

MCP 工具：

只读：`mq_list_targets`、`mq_get_overview`、`mq_list_queues`、`mq_get_queue`、`mq_list_exchanges`、`mq_list_bindings`、`mq_list_connections`、`mq_list_channels`、`mq_list_alerts`、`mq_get_alert`、`mq_query_metrics`、`mq_peek_messages`、`mq_get_node_health`、`mq_search_audit_logs`、`mq_get_approval`。

写操作：`mq_create_queue`、`mq_delete_queue`、`mq_purge_queue`、`mq_publish_message`、`mq_create_binding`、`mq_delete_binding`、`mq_close_connection`。

### 8.3 配置 opencode

复制示例：

```bash
cp opencode.example.json opencode.json
```

`opencode.json` 已在 `.gitignore` 中，不会被提交。示例内容：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "hainmq-ops": {
      "type": "local",
      "command": ["node", "mcp/server.mjs"],
      "enabled": true,
      "environment": {
        "OPS_BASE_URL": "http://127.0.0.1:3000",
        "OPS_MCP_TOKEN": "{env:OPS_MCP_TOKEN}"
      }
    }
  }
}
```

在启动 opencode 的终端中设置：

```bash
# Windows PowerShell
$env:OPS_MCP_TOKEN="你的 token"
# macOS / Linux
export OPS_MCP_TOKEN="你的 token"
```

在仓库根目录启动 opencode，确认工具列表中出现 `hainmq-ops`。修改配置后需要重启 opencode。

示例提问：

- “列出当前队列，按就绪消息数排序。”
- “哪个队列有消息但没有消费者？”
- “查看最近 30 分钟的发布和投递速率。”
- “看一下 emails.dlq 的前 5 条消息。”
- “把 orders.created 的告警静默 1 小时。”

写操作示例：

- “帮我创建一个 orders.retry 队列。”
- 助手会返回 `approval_required`，并提示打开 `/ops/approvals`。
- 操作员核对参数后批准，操作才会执行。

## 9. Web 对话与模型

### 9.1 配置模型

在 `/ops/models` 添加模型：

- Provider：OpenAI 兼容 / Ollama
- Base URL：
  - OpenAI：`https://api.openai.com`
  - DeepSeek 等兼容服务：对应 `https://.../v1`
  - Ollama：`http://host.docker.internal:11434/v1`
- 模型名
- API Key（加密存储，前端不回显）
- Temperature、最大 Token、系统提示词
- 是否默认、是否启用

保存后可点击“测试”验证连接。

### 9.2 使用对话

打开 `/ops/chat`，选择模型并提问。助手可以：

- 调用只读 MCP 工具查询队列、连接、告警和指标。
- 发起写操作审批，但不会直接执行。
- 对话中会展示工具调用参数和结果。

对话记录存储在 SQLite 中。默认只保留对话文本和工具调用摘要；如果开启 `OPS_MCP_ALLOW_PEEK=true`，工具结果中的消息体可能进入对话记录和模型上下文。可在 `/ops/settings` 或通过 `OPS_CHAT_ENABLED=false` 关闭整个对话功能。

## 10. 安全说明

- 运维模块复用 RabbitMQ 登录，但不会保存浏览器用户的密码。
- `OPS_ADMIN_USERS` 默认只允许 `administrator`；留空才会放开给所有管理员。
- 后台采集使用独立的只读账号。
- 写操作由审批人的浏览器会话执行，不保存管理员密码。
- SMTP 密码、Webhook 密钥、MQ 密码、模型 API Key 使用 AES-256-GCM 加密。
- `OPS_ENCRYPTION_KEY` 丢失后，已保存的密钥无法解密，需要重新填写。
- `.env`、`opencode.json`、`data/`、`*.db`、`secrets/` 已加入 `.gitignore`。
- 任何推送前请先审核 `git status` 和 `git diff`，确保没有真实密钥。
- 日志和 API 响应会对敏感字段脱敏；审计日志会脱敏密码/Token/消息体；MCP 返回的消息体会截断。
- 对话功能可全局关闭；`OPS_MCP_ALLOW_PEEK` 默认关闭。开启后，队列名、指标和消息体可能发送到模型服务，敏感环境请使用本地 Ollama。
- 仅支持单实例、内网部署；不要将 `3000`、`15672` 直接暴露到公网。

## 11. 数据备份与恢复

SQLite 文件位于 Docker 卷 `hainmq-data` 的 `/app/data/ops.db`。

在 `/ops/backups` 可以：

- 立即创建一致性备份（`VACUUM INTO`）
- 下载或删除备份
- 将备份标记为待恢复，然后重启容器生效
- 按 `OPS_BACKUP_RETENTION_DAYS` 自动清理旧备份

调度器默认每 24 小时自动备份一次。恢复流程：

```bash
docker compose restart hainmq-console
```

恢复前会在数据库旁保留一份 `ops.db.pre-restore-*` 安全副本。也可以手动备份：

```bash
docker run --rm -v hainmq-data:/data -v ${PWD}:/backup alpine \
  cp /data/ops.db /backup/ops.db
```

## 12. 常见问题

### 访问 `/ops` 返回 403

当前 RabbitMQ 用户没有 `administrator`、`policymaker`、`management` 或 `monitoring` tag。给用户添加 tag 后重新登录。如果设置了 `OPS_ADMIN_USERS`，确认用户名在名单中。

### 页面显示 `OPS_ENCRYPTION_KEY is not configured`

没有配置加密密钥，或密钥不是 32 字节 base64。重新生成并写入 `.env`，然后重启容器。已保存的旧密钥无法恢复。

### 采集失败 / 服务不可达

- 确认 RabbitMQ Management 插件已启用。
- 确认 `OPS_RABBITMQ_USERNAME` / `OPS_RABBITMQ_PASSWORD` 可访问 `15672`。
- 从容器内测试：`wget -qO- http://host.docker.internal:15672/api/overview`。
- 检查 Vhost 权限。

### Webhook 测试失败

- 检查 URL、端口、防火墙。
- 如果是内网地址，需要打开 `allowPrivate` 或 `OPS_WEBHOOK_ALLOW_PRIVATE=true`。
- 查看通道测试返回的错误信息和告警详情中的通知记录。

### 告警没有发送

- 规则是否绑定了通知通道。
- 通道是否启用。
- 是否处于全局维护窗口或告警静默时间。
- 查看告警详情的通知投递记录和失败原因。

### 应用停止期间会告警吗

不会。当前架构是单进程内调度，应用停止期间不采集、不告警。启动后会恢复采集。

## 13. 审计、角色与双人审批

- `/ops/audit` 查询写操作、审批、配置变更和调度事件，可按操作人、动作、对象和时间筛选，并导出 CSV。
- `/ops/roles` 为 RabbitMQ 用户名设置本地运维角色（viewer / operator / admin）；没有本地覆盖的用户继续按 RabbitMQ tag 继承。
- 开启“双人审批”后，写操作需要两位不同操作人审批：第一位记录初审，第二位批准后才执行。可在 `/ops/settings` 或 `OPS_TWO_PERSON_APPROVAL=true` 开启。

## 14. Prometheus 指标

`GET /api/metrics` 输出 Prometheus 文本格式，包括：

- `hainmq_target_up`
- `hainmq_queue_messages` / `hainmq_queue_ready` / `hainmq_queue_unacked`
- `hainmq_node_memory_alarm` / `hainmq_node_disk_alarm`
- `hainmq_alert_active`
- 通用 `hainmq_metric`

默认允许内网无认证抓取；设置 `OPS_METRICS_TOKEN` 后需携带 `Authorization: Bearer <token>`。

## 15. 消息移动与 DLQ 重放

在队列详情打开消息查看器，点击“移动消息”：

- 目标可以是队列或交换机
- 可指定数量、交换机路由键
- 队列名以 `.dlq` 结尾时默认填入去掉后缀的队列名
- 消息先从源队列取出，发布失败时尝试退回源队列
- 建议先用小数量验证目标绑定和路由

历史指标超过保留期后会按小时降采样到 `ops_samples_rollup`，保留 365 天。
