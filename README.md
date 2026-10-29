# HainMQ Console

English | [简体中文](README.zh-CN.md) | [Website](https://cn-cam.github.io/hainmq-console/)

A modern, open-source management and operations console for RabbitMQ.

> 海心云 MQ 管理台 · Based on RabbitScout (MIT)

HainMQ Console is a fork of RabbitScout with a bilingual UI, configurable branding, an operations module, MCP automation, and model-assisted chat.

RabbitMQ is a trademark of its respective owner. This project is not affiliated with, sponsored by, or endorsed by the RabbitMQ project or its trademark owners.

![License](https://img.shields.io/badge/license-MIT-blue)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![CI](https://github.com/cn-cam/hainmq-console/actions/workflows/ci.yml/badge.svg)
![Stars](https://img.shields.io/github/stars/cn-cam/hainmq-console)

---

## Features

**Dashboard** — Real-time overview with canvas-rendered streaming charts, adjustable time ranges (Live / 10m / 1h / 8h / 24h backed by the broker's own sample history), queue distribution, cluster health with memory/disk alarms, and animated stats.

**Queues** — Create (classic, quorum, stream), inspect, and delete queues. A detail drawer shows per-queue rate history, consumers, and arguments. Peek, filter, download, publish, purge, and move messages to another queue or exchange — including DLQ replay — with confirmation.

**Exchanges** — Declare and delete exchanges, inspect bindings, and add new bindings to queues.

**Connections** — Monitor active connections with client-provided connection names, throughput metrics, and a detail drawer. Close connections when needed.

**Channels** — View channel state, prefetch counts, rates, and consumer counts.

**Internationalization** — English and Simplified Chinese UI. English is the default; switch languages from the login page or the dashboard header. The choice is stored in a cookie.

**Operations** — Built-in monitoring for broker health, queues, messages, connections, and channels. Alert rules, email/Webhook channels with DingTalk/Feishu/WeCom/Slack/Teams/Telegram presets, escalation channels, silence and maintenance windows, audit log export, local role overrides, two-person approval, MCP automation, and model-assisted chat. Uses embedded SQLite and an in-process scheduler; no PostgreSQL or extra worker container. See [the operations guide](docs/ops-module.zh-CN.md).

**Command palette** — `Ctrl/⌘ K` to jump to any page or queue, toggle the theme, or pause live updates.

**Live-data controls** — Broker connection status in the header, a refresh-cadence picker (2s → 30s or paused), automatic pause while the tab is hidden, and a global vhost scope switcher.

**Auth** — Pass-through authentication. Each user logs in with their own RabbitMQ credentials. No server-side password storage. Works on RabbitMQ 3.x and 4.x.

**Administration** — Manage virtual hosts, users, permissions, policies, nodes and feature flags, and import/export RabbitMQ definitions. RabbitMQ's own permissions still apply.

**Multi-cluster** — Configure multiple RabbitMQ Management endpoints with `RABBITMQ_CLUSTERS`; choose a cluster at login and switch from the header. Credentials are validated against the selected cluster and remain pass-through.

**Observability** — Prometheus-compatible `GET /api/metrics` with per-target, queue, node-alarm, and active-alert series. Optionally protect it with `OPS_METRICS_TOKEN`.

**Reliability** — SQLite WAL, daily backups, staged one-click restore, hourly downsampling of expired samples, configurable retention, startup integrity check, and graceful shutdown.

**Theming** — Dark and light mode with a refined, minimal UI. Fully responsive, down to mobile.

---

## Quick Start

### Prerequisites

- Node.js 20.9+ (Node 24 LTS recommended)
- A running RabbitMQ instance with the [Management Plugin](https://www.rabbitmq.com/docs/management) enabled

### Install

```bash
git clone https://github.com/cn-cam/hainmq-console.git
cd hainmq-console
npm install
```

### Configure

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Edit `.env` with your RabbitMQ Management API connection:

```env
RABBITMQ_HOST=localhost
RABBITMQ_PORT=15672
RABBITMQ_PROTOCOL=http
```

That's it. No username or password in the config — users authenticate on the login page with their own RabbitMQ credentials.

### Run

```bash
# Development
npm run dev

# Production
npm run build && npm start
```

Open [http://localhost:3000](http://localhost:3000) and log in with your RabbitMQ credentials.

### Develop without a broker

A faithful mock of the RabbitMQ Management API (3.x and 4.x response shapes) ships with the repo:

```bash
npm run mock          # mock broker on :15672 (users: admin/admin, monitor/monitor, plain/plain)
npm run dev           # point RABBITMQ_PORT=15672 at it
```

### Operations module

The operations module is optional and reuses the same login. To enable it:

```bash
cp .env.ops.example .env
# set OPS_ENCRYPTION_KEY, OPS_MCP_TOKEN, OPS_RABBITMQ_USERNAME, OPS_RABBITMQ_PASSWORD
docker compose up -d --build
```

Open `/ops` with a RabbitMQ user that has the `administrator`, `policymaker`, `management`, or `monitoring` tag. Full configuration, MCP/opencode setup, alert rules, Webhook signing, and troubleshooting are documented in [docs/ops-module.zh-CN.md](docs/ops-module.zh-CN.md).

---

## Docker

### Prebuilt image (Docker Hub)

Multi-arch image for `linux/amd64` and `linux/arm64`:

```bash
docker pull cocam/hainmq-console:2.1.2

docker run -d --name hainmq-console \
  -p 3000:3000 \
  -e RABBITMQ_HOST=host.docker.internal \
  -e RABBITMQ_PORT=15672 \
  -e RABBITMQ_PROTOCOL=http \
  -v hainmq-data:/app/data \
  --restart=always \
  cocam/hainmq-console:2.1.2
```

Available tags: `2.1.2`, `2.1`, `2`, `latest`.

### Docker Compose (recommended)

```bash
cp .env.example .env
# edit .env: RABBITMQ_HOST, HAINMQ_IMAGE, HAINMQ_PORT, ...
docker compose up -d --build
```

The Compose file defaults to `host.docker.internal` for `RABBITMQ_HOST`, so it works with a RabbitMQ container or a local broker on Docker Desktop. On Linux, the included `host-gateway` entry provides the same hostname.

### docker run

Build the image locally (the upstream GHCR image does not include this fork's changes):

```bash
docker build -t hainmq-console:2.1.2 .

docker run -d --name hainmq-console \
  -p 3000:3000 \
  -e RABBITMQ_HOST=host.docker.internal \
  -e RABBITMQ_PORT=15672 \
  -e RABBITMQ_PROTOCOL=http \
  -v hainmq-data:/app/data \
  --restart=always \
  hainmq-console:2.1.2
```

If GitHub Actions is enabled for this repository, `docker-publish.yml` publishes a multi-arch image to both `ghcr.io/<owner>/hainmq-console` and Docker Hub. Otherwise build locally or use Compose.

The image runs as a non-root user and includes a container `HEALTHCHECK` against `/api/health`.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `RABBITMQ_HOST` | Yes | `localhost` | RabbitMQ Management API hostname |
| `RABBITMQ_PORT` | No | `15672` | Management API port (omit for default/standard ports) |
| `RABBITMQ_PROTOCOL` | No | `http` | `http` or `https` |
| `RABBITMQ_CLUSTER_NAME` | No | host | Display name for the default single cluster |
| `RABBITMQ_CLUSTERS` | No | — | JSON array of clusters with `id`, `name`, `host`, `port`, `protocol`; enables the cluster selector |
| `RABBITMQ_API_TIMEOUT_MS` | No | `15000` | API request timeout in milliseconds |
| `COOKIE_SECURE` | No | auto | Force the session cookie's `Secure` attribute (`true`/`false`). By default it is detected per request, including `x-forwarded-proto` behind proxies |

### Operations variables

| Variable | Default | Description |
|---|---|---|
| `OPS_RABBITMQ_USERNAME` | — | Read-only RabbitMQ account used by the background collector |
| `OPS_RABBITMQ_PASSWORD` | — | Password for the collector account |
| `OPS_ENCRYPTION_KEY` | — | Base64 32-byte key for encrypting stored secrets |
| `OPS_MCP_TOKEN` | — | Bearer token for the MCP server |
| `OPS_MCP_ALLOW_WRITE` | `true` | Register write tools; every write still needs human approval |
| `OPS_MCP_ALLOW_PEEK` | `false` | Allow MCP/chat to read message payloads; keep off for sensitive brokers |
| `OPS_MCP_ALLOWED_VHOSTS` | `/` | Comma-separated vhost allowlist; `*` allows all |
| `OPS_MCP_QUEUE_PREFIXES` | — | Optional comma-separated queue prefix allowlist |
| `OPS_POLL_INTERVAL_MS` | `60000` | Collector interval in milliseconds |
| `OPS_ADMIN_USERS` | `administrator` | Comma-separated RabbitMQ usernames allowed to administer ops; empty means all administrators |
| `OPS_WEBHOOK_ALLOW_PRIVATE` | `false` | Allow Webhooks to target private network addresses |
| `OPS_CHAT_ENABLED` | `true` | Enable the operations chat page; can also be toggled in Settings |
| `OPS_TWO_PERSON_APPROVAL` | `false` | Require two different operators to approve write operations |
| `OPS_AUDIT_RETENTION_DAYS` | `365` | Audit log retention |
| `OPS_BACKUP_RETENTION_DAYS` | `7` | SQLite backup retention |
| `OPS_METRICS_TOKEN` | — | Optional bearer token for `GET /api/metrics`; empty allows unauthenticated scrapes |
| `OPS_DB_PATH` | `/app/data/ops.db` | Embedded SQLite database path |

See [.env.ops.example](.env.ops.example) for a complete template.

### Branding and copyright

These are public runtime variables. Restart the container after changing them; no rebuild is required.

| Variable | Default | Description |
|---|---|---|
| `APP_NAME` | `海心云` | Product name shown on the login page and sidebar |
| `APP_PRODUCT_NAME` | `MQ 管理台` | Product subtitle |
| `APP_COPYRIGHT` | `© 2026 海心云` | Copyright line shown in the login and dashboard footer |
| `APP_LICENSE` | `MIT` | License label shown in the footer |
| `APP_LICENSE_URL` | this repository's `LICENSE` | License link |
| `APP_ATTRIBUTION` | `Based on RabbitScout (MIT)` | Upstream attribution text |
| `APP_ATTRIBUTION_URL` | `https://github.com/Ralve-org/RabbitScout` | Upstream attribution link |
| `APP_LOGO_URL` | empty | Your own logo URL; empty uses the initial-letter mark instead of upstream brand assets |

### Docker Compose variables

These are read by Docker Compose from `.env`; they are not runtime variables of the app.

| Variable | Default | Description |
|---|---|---|
| `HAINMQ_IMAGE` | `hainmq-console:2.1.2` | Image name and tag used or built by Compose |
| `HAINMQ_PORT` | `3000` | Host port published for the web UI |
| `HAINMQ_CONTAINER_NAME` | `hainmq-console` | Container name used by Compose |

---

## Languages

### README versions

- English (this file)
- [简体中文](README.zh-CN.md)

### UI languages

- English (default)
- Simplified Chinese (`zh-CN`)

Use the globe icon on the login page or dashboard header to switch languages. The choice is stored in the `hainmq-locale` cookie. English is used when no choice has been made. To follow the browser language instead, restore `Accept-Language` detection in `lib/i18n/server.ts`.

### Add another UI language

1. Copy `lib/i18n/messages/en.ts` to `lib/i18n/messages/<locale>.ts` and translate every value.
2. Add the locale code to `LOCALES` and `LOCALE_LABELS` in `lib/i18n/config.ts`.
3. Register the dictionary in `lib/i18n/dictionaries.ts`.
4. Optional: add `README.<locale>.md` and link it at the top of this file.

Message keys are typed, so `npm run typecheck` fails if a translation is missing a key.

---

## Screenshots

| English | 简体中文 |
|---|---|
| ![Operations dark](docs/assets/ops-en-dark.png) | ![运维深色](docs/assets/ops-zh-dark.png) |
| ![Operations light](docs/assets/ops-en-light.png) | ![运维浅色](docs/assets/ops-zh-light.png) |

The screenshots show the Rules page. The module also includes Overview, Alerts, Channels, Targets, Approvals, Chat, Models, and Settings. They were captured before replacing the upstream logo; production uses your `APP_LOGO_URL` or the initial-letter mark.

---

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org) (App Router, React 19, Turbopack)
- **Language**: TypeScript (strict mode)
- **UI**: [shadcn/ui](https://ui.shadcn.com)-style components on [Radix UI](https://www.radix-ui.com) + [Tailwind CSS v4](https://tailwindcss.com)
- **Charts**: [uPlot](https://github.com/leeoniya/uPlot) (canvas streaming + history) and a hand-rolled SVG donut — no chart mega-dependencies
- **Command palette**: [cmdk](https://cmdk.paco.me)
- **Animation**: [Motion](https://motion.dev)
- **State**: [Zustand](https://zustand-demo.pmnd.rs)
- **Icons**: [Lucide](https://lucide.dev)

---

## Project Structure

```
app/
  layout.tsx                      Server root layout with locale-aware metadata
  (auth)/login/page.tsx           Login page
  (dashboard)/
    layout.tsx                    Responsive shell: sidebar, header, mobile nav
    page.tsx                      Overview dashboard with time ranges
    queues/page.tsx               Queue management
    exchanges/page.tsx            Exchange management
    connections/page.tsx          Connection management
    channels/page.tsx             Channel management
    ops/                          Operations dashboard, rules, channels, approvals, chat
  api/
    auth/login/route.ts           POST — validate credentials, set session cookie
    auth/logout/route.ts          POST — clear session cookie
    auth/me/route.ts              GET — current session user (store rehydration)
    health/route.ts               GET — liveness probe for Docker/K8s
    publish/route.ts              POST — publish message (handles the default exchange)
    rabbitmq/[...path]/route.ts   Catch-all proxy to the RabbitMQ Management API

proxy.ts                          Auth gate: 401 JSON for APIs, login redirect for pages
instrumentation.ts                Starts the in-process operations scheduler

lib/
  i18n/                           Locale config, dictionaries, provider, server helpers
  ops/                            SQLite, collector, rules, notifications, approvals, chat, MCP
  rabbitmq/                       API client, config, types, error classification
  auth/                           Session cookie helpers, client auth store
  stores/preferences.ts           Refresh cadence, vhost scope, density, sidebar

hooks/
  use-polling.ts                  Visibility-aware polling with abort + status reporting
  use-live-series.ts              Rolling window accumulation for live charts
  use-toast.ts                    Toast state

components/
  layout/                         Sidebar, header, command palette, locale switcher
  dashboard/                      Stat cards, streaming charts, donut, time ranges
  queues/                         Table, drawer, message viewer, publish/create/delete
  exchanges/                      Table, binding viewer + add-binding, create dialog
  connections/                    Table + detail drawer
  channels/                       Table
  shared/                         Page header, table utilities, error boundary, error card
  ui/                             shadcn/ui-style primitives

mcp/
  server.mjs                      stdio MCP server for local opencode

scripts/
  mock-rabbitmq.mjs               Mock Management API (3.x / 4.x modes) for development
  e2e.mjs                         End-to-end test suite against the mock broker
```

---

## How Auth Works

HainMQ Console uses **pass-through authentication**. When a user logs in, their credentials are validated directly against the RabbitMQ Management API (`/api/whoami`). On success, the credentials are stored in an httpOnly cookie and forwarded with every subsequent API request.

- No passwords are stored in environment variables or on disk
- Each user authenticates with their own RabbitMQ account
- The selected cluster is stored in the session; switching validates the same credentials against the new cluster
- Session expires after 24 hours
- All API calls are proxied through Next.js with the user's own credentials
- The cookie's `Secure` attribute is detected per request (`x-forwarded-proto` aware), so plain-HTTP deployments keep working sessions and HTTPS deployments stay strict

This means RabbitMQ's built-in permission system (management, monitoring, policymaker, administrator tags) is fully respected. User tags are parsed correctly on every supported broker: RabbitMQ ≤ 3.8 returns them as a comma-separated string, 3.9+ as an array — both work.

---

## Compatibility

- RabbitMQ 3.x and 4.x with the `rabbitmq_management` plugin enabled.
- HainMQ Console talks to the RabbitMQ Management HTTP API (default port `15672`). The AMQP port (`5672`) alone is not enough.
- Managed services that do not expose port `15672` or do not allow plugin/configuration changes cannot be used.

---

## Security Notes

- Operations reuses the RabbitMQ login. `OPS_ADMIN_USERS` defaults to `administrator`; set it explicitly for your environment, or set it empty to allow all RabbitMQ administrators.
- The background collector uses a dedicated read-only RabbitMQ account, not a browser session.
- MCP write operations require approval in `/ops/approvals` and run with the approver's RabbitMQ credentials. Set `OPS_MCP_ALLOW_WRITE=false` to remove write access entirely.
- MCP/chat message peeking is disabled by default (`OPS_MCP_ALLOW_PEEK=false`). When enabled, message payloads are sent to the configured model provider. Use a local model for sensitive data.
- Operations chat can be disabled globally in `/ops/settings` or with `OPS_CHAT_ENABLED=false`.
- SMTP passwords, Webhook secrets, MQ passwords, and model API keys are encrypted with AES-256-GCM. `.env`, `data/`, `*.db`, and `opencode.json` are gitignored.
- This module is designed for single-instance, intranet deployments. Do not expose ports `3000` or `15672` to the public internet without TLS and network controls.

## Testing

```bash
npm run lint          # ESLint 9 (flat config)
npm run typecheck     # tsc --noEmit
npm run build         # production build
npm run e2e           # end-to-end suite against the bundled mock broker
```

The e2e suite covers the full auth surface (both broker tag formats, Secure-cookie behavior over HTTP and behind HTTPS proxies), the management proxy, publishing, and queue lifecycle.

---

## CI/CD

- **`ci.yml`** — lint, typecheck, build, and e2e on every pull request and push to `main`
- **`docker-publish.yml`** — builds and pushes a multi-arch (amd64/arm64) image to GHCR and Docker Hub only on `v*` tags or manual dispatch. It does not run on every commit. Docker Hub publishing requires `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` repository secrets.

To publish a release, add the two Docker Hub secrets, then push a version tag or run **Build & Push Docker Image** manually from the Actions tab:

```bash
git tag v2.1.2
git push origin v2.1.2
```
- **Dependabot** — weekly grouped updates for npm, GitHub Actions, and the Docker base image

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run lint && npm run typecheck && npm run build && npm run e2e`
5. Open a pull request

---

## License

MIT — see [LICENSE](LICENSE).

HainMQ Console / 海心云 MQ 管理台 is a fork of RabbitScout. This distribution retains the original RabbitScout copyright notice (`Copyright (c) 2024 Ralve`) and adds modifications copyright (`Copyright (c) 2026 海心云`); see [NOTICE](NOTICE) and [COPYRIGHT](COPYRIGHT). The original MIT permission notice must remain in copies and substantial portions of the software. "RabbitScout" is used only to attribute the upstream project; this distribution does not claim the upstream project's trademarks or branding.

The UI copyright line is configurable via `APP_COPYRIGHT` and is separate from the source-code license.

The Docker image includes `LICENSE`, `NOTICE`, and `COPYRIGHT`; do not remove them when redistributing. The MIT license does not grant trademark rights. Upstream names and brand assets are used only for attribution; set `APP_LOGO_URL` to your own logo for a production distribution.

RabbitMQ is a trademark of its respective owner. This project is not affiliated with, sponsored by, or endorsed by the RabbitMQ project or its trademark owners.
