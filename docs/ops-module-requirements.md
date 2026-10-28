# 海心云 MQ 管理台运维模块需求说明（已确认）

> 状态：需求已确认，开发中。
> 约束：只对接 RabbitMQ；不引入 PostgreSQL；不引入独立 Worker；不新增常驻服务；保持现有单容器/单进程架构。

## 1. 目标

在现有海心云 MQ 管理台上新增运维模块：

1. 监控 RabbitMQ 服务状态、队列异常、消息异常、连接/通道异常。
2. 邮件 + Webhook 告警，支持配置多个通道，后台可管理。
3. 告警触发、恢复、确认、静默、历史、通知投递记录。
4. 提供 MCP，优先接入本地 opencode；第一期读写都支持，写操作必须人工确认后执行。
5. 提供 Web 对话页面，可配置多个模型并调用 MCP 工具。
6. 敏感配置只保存在本地，不提交远程 Git；推送前由仓库所有者审核。

## 2. 架构约束（已确认）

- 只对接 RabbitMQ Management HTTP API（默认 15672）。
- 不引入 PostgreSQL。
- 不引入独立 Worker 容器。
- 不引入 Redis、消息队列等新常驻服务。
- 保持现有 Next.js 单容器部署。

### 2.1 持久化方案

使用**嵌入式 SQLite**，数据库文件放在挂载卷中：

```text
/app/data/ops.db
```

- 优先使用 Node 24 内置 `node:sqlite`（无原生编译依赖）。
- 如果后续对稳定性有更高要求，可切换 `better-sqlite3`，仍然是嵌入式，不新增容器。
- 开启 WAL、busy timeout；定期清理过期指标和通知记录。
- Docker Compose 增加命名卷 `hainmq-data:/app/data`，并为运行用户授予写权限。

### 2.2 后台任务方案

采集、规则评估、通知发送在 Next.js 进程内通过 `instrumentation.ts` 启动：

- 使用 `setInterval` + 全局单例保护，避免热更新重复启动。
- 启动时从 SQLite 恢复未完成的告警和通知重试任务。
- 应用停止期间不会采集和告警；启动后补采当前状态，但不补历史样本。
- **仅支持单实例部署**。多副本会导致重复采集、重复告警和通知竞争。如果以后要多副本，再引入独立 Worker 或分布式锁。

### 2.3 对现有功能的影响

- 现有管理页面保持不变。
- 新增 `/ops` 路由和 API。
- 新增 SQLite 文件和数据卷，不新增容器。
- 现有 Docker 镜像仍为单进程，启动入口不变。

## 3. 认证与权限（内网部署）

### 3.1 复用当前登录

内网部署下，运维模块**复用当前 RabbitMQ 登录**，不新增账号体系。

- 登录仍然使用 RabbitMQ 用户名/密码。
- 通过 RabbitMQ 用户 tag 映射运维角色：

| RabbitMQ tag | 运维角色 | 权限 |
|---|---|---|
| `administrator` | admin | 配置目标/规则/通道、模型、MCP Token、审批写操作 |
| `policymaker` / `management` | operator | 查看、确认/静默告警、发起写操作申请 |
| `monitoring` | viewer | 只读 |
| 无相关 tag | 禁止访问 `/ops` | 403 |

- 可选 `OPS_ADMIN_USERS`：即使拥有 `administrator` tag，也只有名单内用户能进入运维管理页，避免所有 MQ 管理员都拥有运维配置权。
- 会话有效期 24 小时。为避免 tag 变更后权限滞后，运维写操作和配置操作会重新校验一次 `/api/whoami`（内存缓存 5 分钟）。

### 3.2 后台采集凭据

后台监控不能依赖某个用户在线，因此需要一个**只读 RabbitMQ 服务账号**：

- 在 RabbitMQ 中创建 `hainmq-monitor` 用户，授予 `monitoring` tag，并只读权限。
- 凭据通过本地 `.env` 或加密后的 SQLite 配置保存。
- 该账号只用于采集，不用于写操作。
- 如果 RabbitMQ 权限模型要求，至少需要能访问目标 Vhost 的 `configure`/`read` 权限；建议只授予需要监控的 Vhost。

### 3.3 写操作凭据

写操作不保存管理员密码。审批通过后，由**审批人当前浏览器的会话**携带其 RabbitMQ 凭据执行：

1. MCP/对话发起写操作申请。
2. 后台生成待审批记录。
3. 有权限的用户在 `/ops/approvals` 审核。
4. 审批请求由该用户的浏览器会话调用执行接口，服务端使用其现有 pass-through 凭据调用 RabbitMQ Management API。
5. 执行结果写回审批记录，MCP 轮询获取结果。

这样既满足“人工确认后执行”，又不额外保存管理员凭据。

### 3.4 MCP 凭据

- MCP 使用独立 Bearer Token（`OPS_MCP_TOKEN`），不复用浏览器会话。
- Token 只放在本地环境变量或本地 opencode 配置中，不提交 Git。
- Token 支持只读/可写作用域；写作用域仍受人工审批约束。
- 生产环境必须通过 TLS 或仅本机回环访问。

## 4. 监控与告警需求

### 4.1 监控目标

- 一个或多个 RabbitMQ Management API 目标（host/port/protocol/vhost 范围）。
- 每个目标配置独立的采集凭据（加密存储）。
- 支持连通性测试、能力探测。

### 4.2 服务状态指标

- Management API 可达性、响应时间。
- 节点运行时长、内存告警、磁盘告警。
- 文件描述符使用率、Socket 使用率、Erlang 进程数。
- 连接数、通道数、消费者数。
- 集群节点健康（单节点时仅本节点）。

### 4.3 队列异常指标

- 队列缺失/被删除。
- 队列状态异常。
- Ready 消息数超阈值。
- Unacked 消息数超阈值。
- 有消息但消费者数为 0。
- 消息积压增长速度异常。
- 消费者利用率过低。
- Quorum 队列 leader/副本异常（数据源支持时）。
- 队列内存占用异常。

### 4.4 消息异常指标

- Publish / Deliver 速率骤降或骤增。
- Unroutable 消息增长。
- Redelivered 比例升高。
- 死信队列/死信消息增长。
- 消息积压持续增长或长期不消费。
- 最老消息年龄超限（数据源支持时）。
- 消息大小异常（可选）。

### 4.5 连接/通道异常

- 连接数、通道数突增或骤降。
- 连接异常关闭频率升高。
- 单连接通道数接近上限。

### 4.6 告警规则

```text
规则名称
监控目标
作用范围：Vhost / Queue / Exchange / 全局
指标
比较方式：> >= < <= == !=、缺失、变化率
阈值
持续时间
恢复条件（可选）
严重级别：info / warning / critical
通知通道（可多选）
告警模板
冷却时间
启用/停用
维护窗口/静默期
```

要求：

- 内置常用模板，可一键启用。
- 同一规则同一对象只保留一个活动告警。
- 支持确认、静默、手动关闭、恢复通知。
- 告警风暴聚合与冷却。
- 通知失败重试与投递日志。
- 指标采样频率可配置，默认 60 秒。
- 指标保留默认 30 天，告警保留默认 180 天，可配置。

## 5. 通知渠道

### 5.1 邮件

- 多个 SMTP 通道，后台增删改查、启用/停用。
- 字段：Host、Port、TLS/SSL、用户名、密码、From、From Name、收件人、抄送、回复地址。
- 密码 AES-256-GCM 加密存储，接口脱敏。
- 测试发送。
- 纯文本 + HTML 模板。
- 一个规则可绑定多个邮件通道。

### 5.2 Webhook

- 多个 Webhook 通道。
- 字段：URL、Method、Headers、Body 模板、超时、重试次数、签名密钥、启用状态。
- HMAC 签名，例如 `X-HainMQ-Signature`。
- 通用 JSON + 钉钉/企业微信/飞书/Slack 预设模板。
- SSRF 防护：
  - 仅允许 http/https。
  - 默认禁止回环、链路本地、云元数据地址。
  - 内网部署如确需访问 RFC1918 地址，通过 `OPS_WEBHOOK_ALLOW_PRIVATE=true` 或按通道白名单显式放开。
- 投递日志、响应码/响应摘要、失败重试、限速。
- 一个规则可绑定多个 Webhook 通道。

### 5.3 通知通用

- 告警可同时发多个通道。
- 通道级启用/停用。
- 失败退避、重试、手动重发。
- 模板变量：实例、对象、指标、当前值、阈值、持续时间、严重级别、时间、告警链接。
- 恢复通知可单独开关。

## 6. MCP 自动化运维

### 6.1 接入方式

- 优先支持本地 opencode 通过 **stdio** 接入。
- MCP Server 作为本地子进程运行，不监听公网端口。
- 通过 Bearer Token 调用本机海心云 MQ 管理台 `/api/ops/mcp/*`。
- 后续如需远程 MCP，只允许 HTTPS + Token + 来源限制。

### 6.2 只读工具

- `mq_list_targets`
- `mq_get_overview`
- `mq_list_queues`
- `mq_get_queue`
- `mq_list_exchanges`
- `mq_list_bindings`
- `mq_list_connections`
- `mq_list_channels`
- `mq_list_alerts`
- `mq_get_alert`
- `mq_query_metrics`
- `mq_peek_messages`（默认最多 10 条，非破坏性）
- `mq_get_node_health`
- `mq_search_audit_logs`（仅 admin）

### 6.3 写工具（需人工审批）

- `mq_create_queue`
- `mq_delete_queue`
- `mq_purge_queue`
- `mq_publish_message`
- `mq_create_binding`
- `mq_delete_binding`
- `mq_close_connection`

流程：

1. 工具调用创建审批记录，返回 `approval_required`、审批 ID 和审批链接。
2. 有权限的用户在 `/ops/approvals` 查看影响范围并批准/拒绝。
3. 批准时由审批人的浏览器会话执行 RabbitMQ 操作。
4. MCP 通过 `mq_get_approval` 轮询状态和结果。
5. 审批默认 10 分钟过期；结果保留审计记录。

约束：

- `OPS_MCP_ALLOW_WRITE=false` 时写工具不注册。
- 支持 Vhost/队列前缀白名单。
- 禁止批量删除、禁止清空所有队列。
- 高风险操作必须显示对象名并要求确认。
- 所有调用写审计日志（调用方、模型、参数摘要、审批人、结果）。

### 6.4 安全要求

- MCP Token 有作用域、有效期、可轮换。
- 模型和对话上下文不包含 MQ/SMTP/Webhook/模型密钥。
- 工具结果脱敏、截断、限制条数。
- 消息内容、队列名等一律视为不可信数据，防止 Prompt Injection。
- 速率限制、超时、最大响应体积。
- MCP 不直接访问 SQLite；只调用 Ops API。

## 7. Web 对话与模型管理

- 新增 `/ops/chat` 页面，支持流式输出、工具调用展示、结果折叠、写操作审批。
- 管理员可配置多个模型：
  - 名称、Provider（OpenAI 兼容 / Ollama / Anthropic / 自定义）、Base URL、API Key、模型名、温度、最大 Token、超时、系统提示词、可用工具范围、启用状态。
  - 默认模型、测试连接。
  - API Key 加密存储，前端不回显。
- 用户只能使用启用的模型。
- 对话记录保留时间可配置；默认不记录消息体。
- 优先完成本地 opencode + MCP，Web 对话放后一阶段。

## 8. 安全与 Git 约束

- `.env`、`.env.local`、`opencode.local.json`、`secrets/`、`data/`、`*.db` 加入 `.gitignore`。
- 只提交示例文件：`.env.ops.example`、`opencode.example.json`，全部使用占位符。
- 真实 Token、SMTP 密码、Webhook 密钥、模型 API Key、MQ 密码不得进入 Git。
- 推送前由仓库所有者审核。
- 数据库敏感字段 AES-256-GCM 加密，主密钥来自 `OPS_ENCRYPTION_KEY`。
- 日志和 API 响应统一脱敏。
- 所有写操作 CSRF 防护、权限校验、审计。

## 9. 数据模型（SQLite）

- `ops_targets`：监控目标、连接配置（加密）、启用状态。
- `ops_samples`：指标采样（目标、对象、指标、值、时间）。
- `ops_rules`：规则、范围、指标、阈值、持续时间、级别。
- `ops_rule_channels`：规则与通道多对多。
- `ops_channels`：邮件/Webhook 配置（加密）。
- `ops_alerts`：告警实例、状态、确认/静默。
- `ops_notifications`：投递记录、重试、响应摘要。
- `ops_approvals`：MCP/对话写操作审批。
- `ops_audit_logs`：配置变更、MCP 调用、审批、登录。
- `ops_settings`：采集频率、保留策略、时区。
- `ops_model_profiles`：模型配置（API Key 加密）。
- `ops_chat_sessions` / `ops_chat_messages`：对话记录。

## 10. 部署与配置

### 10.1 Docker Compose

在现有 `hainmq-console` 服务中增加：

```yaml
volumes:
  - hainmq-data:/app/data
environment:
  - OPS_DB_PATH=/app/data/ops.db
  - OPS_ENCRYPTION_KEY=${OPS_ENCRYPTION_KEY}
  - OPS_MCP_TOKEN=${OPS_MCP_TOKEN}
  - OPS_MCP_ALLOW_WRITE=${OPS_MCP_ALLOW_WRITE:-false}
  - OPS_RABBITMQ_USERNAME=${OPS_RABBITMQ_USERNAME}
  - OPS_RABBITMQ_PASSWORD=${OPS_RABBITMQ_PASSWORD}
  - OPS_POLL_INTERVAL_MS=${OPS_POLL_INTERVAL_MS:-60000}
  - OPS_ADMIN_USERS=${OPS_ADMIN_USERS:-}
  - OPS_WEBHOOK_ALLOW_PRIVATE=${OPS_WEBHOOK_ALLOW_PRIVATE:-false}
volumes:
  hainmq-data:
```

不新增服务，不新增容器。

### 10.2 本地 opencode

- 提供 `opencode.example.json`，使用环境变量引用 `OPS_MCP_TOKEN`。
- 真实配置放本地 `opencode.local.json` 或用户级 opencode 配置，不提交。
- 文档说明如何启动 MCP、验证工具、关闭写权限、轮换 Token。

### 10.3 文档交付

开发完成后提供：

- 部署与升级说明。
- SMTP、钉钉、企业微信、飞书、Slack 配置示例。
- MCP + opencode 配置步骤和安全说明。
- 模型 Provider 配置示例。
- 常见故障排查。
- 数据备份/恢复（SQLite 文件）。

## 11. 分阶段实施

### 阶段 1：监控与告警

- SQLite、instrumentation 调度器、目标管理。
- 服务/队列/消息/连接指标采集。
- 规则引擎、告警生命周期、维护窗口。
- 多邮件/多 Webhook、测试发送、投递日志。
- `/ops` 总览、告警、规则、通道页面。

### 阶段 2：MCP 与本地 opencode

- stdio MCP Server。
- 只读工具 + 写工具审批流程。
- Token 作用域、审计、限速。
- `opencode.example.json` 与文档。

### 阶段 3：Web 对话与模型管理

- 模型配置、加密存储、测试连接。
- 对话页面、流式输出、工具调用、审批。
- 多 Provider 支持。

## 12. 验收标准

- 服务不可达、队列积压、无消费者、消息速率异常能在配置时间内触发告警。
- 告警可发送到多个邮件和多个 Webhook，失败有重试和日志。
- 通道、规则、目标、模型均可后台配置，密钥不回显。
- 复用 RabbitMQ 登录，tag 映射权限生效；未授权用户访问 `/ops` 返回 403。
- 本地 opencode 能通过 MCP 查询实例、队列、告警、指标。
- 写操作必须人工审批；未审批调用被拒绝并记录审计。
- 真实密钥不出现在 Git、日志、前端响应和模型上下文。
- 单实例重启后 SQLite 数据保留，未完成通知可重试。
- 文档可从零完成部署、配置、接入 opencode 和排障。

## 13. 已确认决策

1. 接受**嵌入式 SQLite + Next.js 进程内调度**，不新增容器，仅支持单实例。
2. 接受复用 RabbitMQ 登录 + tag 映射权限，并支持可选的 `OPS_ADMIN_USERS` 白名单。
3. 后台采集使用独立的只读 RabbitMQ 服务账号，不依赖用户在线。
4. MCP 写操作使用“浏览器审批 + 审批人 RabbitMQ 凭据执行”的方式。
5. Webhook 使用通用 JSON，不内置钉钉/企业微信/飞书/Slack 专用模板。
6. MCP 和 Web 对话一起交付；模型优先支持 OpenAI 兼容和 Ollama。
7. 采集间隔、指标保留、告警保留、通知保留均可在后台配置；默认 60 秒 / 30 天 / 180 天 / 90 天。
8. 运维模块放在当前仓库的 `/ops` 下。
