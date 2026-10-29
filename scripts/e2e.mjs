// End-to-end tests: production build against the mock RabbitMQ broker.
//
// Prerequisites: `npm run build` (CI runs it in the previous step).
// Usage: node scripts/e2e.mjs
//
// Covers the full auth + proxy surface, including the regressions behind
// GitHub issues #19 (Secure cookie over HTTP), #20 (connection names),
// #21 (time-range samples), and #23 (whoami tags array vs string).

import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const MOCK4_PORT = 15774
const MOCK38_PORT = 15773
const APP_PORT = 3199
const APP = `http://localhost:${APP_PORT}`
const OPS_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hainmq-e2e-'))
const OPS_ENV = {
  OPS_DB_PATH: path.join(OPS_TMP, 'ops.db'),
  OPS_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  OPS_ADMIN_USERS: 'admin',
  OPS_MCP_TOKEN: 'e2e-mcp-token',
  OPS_MCP_ALLOW_WRITE: 'true',
}

const procs = []
let passed = 0
let failed = 0

function start(cmd, args, env = {}) {
  const p = spawn(cmd, args, {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })
  procs.push(p)
  return p
}

async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      await fetch(url)
      return
    } catch {
      await sleep(500)
    }
  }
  throw new Error(`Timed out waiting for ${url}`)
}

function check(name, cond, detail = '') {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function login(username, password, headers = {}, clusterId) {
  const res = await fetch(`${APP}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ username, password, ...(clusterId ? { clusterId } : {}) }),
    redirect: 'manual',
  })
  const body = await res.json().catch(() => null)
  return { res, body, cookie: res.headers.get('set-cookie') ?? '' }
}

async function main() {
  console.log('Starting mock brokers and production server…')
  start('node', ['scripts/mock-rabbitmq.mjs', String(MOCK4_PORT), '4'])
  start('node', ['scripts/mock-rabbitmq.mjs', String(MOCK38_PORT), '3'])
  start('npx', ['next', 'start', '-p', String(APP_PORT)], {
    RABBITMQ_HOST: 'localhost',
    RABBITMQ_PORT: String(MOCK4_PORT),
    RABBITMQ_PROTOCOL: 'http',
    RABBITMQ_CLUSTERS: JSON.stringify([
      { id: 'main', name: 'Main', host: 'localhost', port: String(MOCK4_PORT), protocol: 'http' },
      { id: 'legacy', name: 'Legacy', host: 'localhost', port: String(MOCK38_PORT), protocol: 'http' },
    ]),
    ...OPS_ENV,
  })

  await waitFor(`http://localhost:${MOCK4_PORT}/api/whoami`)
  await waitFor(`http://localhost:${MOCK38_PORT}/api/whoami`)
  await waitFor(`${APP}/api/health`)

  console.log('\nHealth & auth gate')
  {
    const res = await fetch(`${APP}/api/health`)
    check('GET /api/health → 200', res.status === 200)
  }
  {
    const res = await fetch(`${APP}/api/rabbitmq/overview`, { redirect: 'manual' })
    check(
      'unauthenticated API call → 401 JSON (not a redirect)',
      res.status === 401,
      `got ${res.status}`,
    )
  }
  {
    const res = await fetch(`${APP}/queues`, { redirect: 'manual' })
    const loc = res.headers.get('location') ?? ''
    check(
      'unauthenticated page → redirect to /login with next param',
      res.status >= 300 && res.status < 400 && loc.includes('/login') && loc.includes('next=%2Fqueues'),
      `got ${res.status} → ${loc}`,
    )
  }

  console.log('\nLogin (RabbitMQ 4.x mock — tags as array; issues #19, #23)')
  let cookie = ''
  {
    const { res, body, cookie: c } = await login('admin', 'admin')
    cookie = c.split(';')[0]
    check('valid login → 200', res.status === 200)
    check('isAdmin is true (tags array parsed) [#23]', body?.user?.isAdmin === true, JSON.stringify(body?.user))
    check(
      "tags contain 'administrator' [#23]",
      Array.isArray(body?.user?.tags) && body.user.tags.includes('administrator'),
    )
    check('session cookie set + HttpOnly', /rmq-session=/.test(c) && /HttpOnly/i.test(c))
    check('cookie NOT Secure over plain HTTP [#19]', !/;\s*Secure/i.test(c), c)
  }
  {
    const { cookie: c } = await login('admin', 'admin', { 'x-forwarded-proto': 'https' })
    check('cookie IS Secure behind HTTPS proxy [#19]', /;\s*Secure/i.test(c), c)
  }
  {
    const { res } = await login('admin', 'wrong')
    check('invalid credentials → 401', res.status === 401)
  }
  {
    const { res, body } = await login('monitor', 'monitor')
    check('non-admin login → isAdmin false', res.status === 200 && body?.user?.isAdmin === false)
  }

  console.log('\nAuthenticated proxy surface')
  const authed = (path, init = {}) =>
    fetch(`${APP}${path}`, { ...init, headers: { cookie, ...(init.headers ?? {}) } })
  {
    const res = await authed('/api/auth/me')
    const body = await res.json()
    check('GET /api/auth/me returns session user', res.status === 200 && body?.user?.username === 'admin')
    check('GET /api/auth/me returns selected cluster', body?.cluster?.id === 'main')
  }
  {
    const res = await fetch(`${APP}/api/clusters`)
    const body = await res.json()
    check(
      'GET /api/clusters lists configured clusters',
      res.status === 200 &&
        body?.defaultId === 'main' &&
        body?.clusters?.length === 2 &&
        body.clusters.some((cluster) => cluster.id === 'legacy'),
    )
  }
  {
    const { res, body, cookie: legacyCookie } = await login('admin', 'admin', {}, 'legacy')
    const sessionCookie = legacyCookie.split(';')[0]
    check(
      'login against selected cluster',
      res.status === 200 && body?.cluster?.id === 'legacy',
    )

    const me = await fetch(`${APP}/api/auth/me`, { headers: { cookie: sessionCookie } })
    const meBody = await me.json()
    check('session stores selected cluster', meBody?.cluster?.id === 'legacy')

    const overview = await fetch(`${APP}/api/rabbitmq/overview`, {
      headers: { cookie: sessionCookie },
    })
    check('proxy uses selected cluster', overview.status === 200)
  }
  {
    const res = await fetch(`${APP}/api/auth/switch-cluster`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ clusterId: 'legacy' }),
    })
    const body = await res.json()
    const switchedCookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
    check(
      'switch cluster updates session',
      res.status === 200 && body?.cluster?.id === 'legacy' && /rmq-session=/.test(switchedCookie),
    )

    const me = await fetch(`${APP}/api/auth/me`, { headers: { cookie: switchedCookie } })
    const meBody = await me.json()
    check('switched session is usable', meBody?.cluster?.id === 'legacy')
  }
  {
    const { res } = await login('admin', 'admin', {}, 'missing')
    check('unknown cluster login → 400', res.status === 400)
  }
  {
    const res = await authed('/api/rabbitmq/overview')
    const body = await res.json()
    check('overview proxies through', res.status === 200 && body?.object_totals?.queues > 0)
  }
  {
    const res = await authed('/api/rabbitmq/overview?msg_rates_age=600&msg_rates_incr=5')
    const body = await res.json()
    check(
      'query params forwarded — samples present [#21]',
      Array.isArray(body?.message_stats?.publish_details?.samples) &&
        body.message_stats.publish_details.samples.length > 10,
    )
  }
  {
    const res = await authed('/api/rabbitmq/queues')
    const body = await res.json()
    check('queues list', Array.isArray(body) && body.length > 0)
  }
  {
    const res = await authed('/api/rabbitmq/vhosts')
    const body = await res.json()
    check('vhosts list (header switcher)', Array.isArray(body) && body.some((v) => v.name === '/'))
  }

  console.log('\nAdmin objects')
  {
    const res = await authed('/api/rabbitmq/users')
    const body = await res.json()
    check('users list', Array.isArray(body) && body.some((user) => user.name === 'admin'))
  }
  {
    const res = await authed('/api/rabbitmq/permissions')
    const body = await res.json()
    check('permissions list', Array.isArray(body) && body.length > 0)
  }
  {
    const res = await authed('/api/rabbitmq/policies')
    const body = await res.json()
    check('policies list', Array.isArray(body) && body.length > 0)
  }
  {
    const res = await authed('/api/rabbitmq/nodes')
    const body = await res.json()
    check('nodes list', Array.isArray(body) && body[0]?.name === 'rabbit@mock')
  }
  {
    const res = await authed('/api/rabbitmq/feature-flags')
    const body = await res.json()
    check('feature flags list', Array.isArray(body) && body.length > 0)
  }
  {
    const res = await authed('/api/rabbitmq/parameters')
    const body = await res.json()
    check('parameters list', Array.isArray(body))
  }
  {
    const res = await authed('/api/rabbitmq/definitions')
    const body = await res.json()
    check(
      'definitions export',
      res.status === 200 && Array.isArray(body?.vhosts) && Array.isArray(body?.users),
    )
  }
  {
    const res = await authed('/api/rabbitmq/definitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vhosts: [] }),
    })
    check('definitions import', res.status === 201 || res.status === 200)
  }
  {
    const vhostPath = `/api/rabbitmq/vhosts/${encodeURIComponent('e2e-temp')}`
    const create = await authed(vhostPath, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'E2E', tags: ['e2e'], tracing: false }),
    })
    check('vhost create', create.status === 201 || create.status === 200)
    const remove = await authed(vhostPath, { method: 'DELETE' })
    check('vhost delete', remove.ok)
  }
  {
    const userName = 'e2e-user'
    const userPath = `/api/rabbitmq/users/${encodeURIComponent(userName)}`
    const create = await authed(userPath, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'secret', tags: ['monitoring'] }),
    })
    check('user create', create.status === 201 || create.status === 200)

    const permissionPath = `/api/rabbitmq/permissions/${encodeURIComponent('/')}/${encodeURIComponent(userName)}`
    const permission = await authed(permissionPath, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configure: '', write: '', read: '.*' }),
    })
    check('permission create', permission.status === 201 || permission.status === 200)

    const policyPath = `/api/rabbitmq/policies/${encodeURIComponent('/')}/e2e-policy`
    const policy = await authed(policyPath, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pattern: 'e2e.*',
        definition: { 'max-length': 10 },
        priority: 1,
        'apply-to': 'queues',
      }),
    })
    check('policy create', policy.status === 201 || policy.status === 200)

    const policyRemove = await authed(policyPath, { method: 'DELETE' })
    check('policy delete', policyRemove.ok)
    const permissionRemove = await authed(permissionPath, { method: 'DELETE' })
    check('permission delete', permissionRemove.ok)
    const userRemove = await authed(userPath, { method: 'DELETE' })
    check('user delete', userRemove.ok)
  }
  {
    const res = await authed('/api/messages/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vhost: '/',
        sourceQueue: 'emails.dlq',
        targetType: 'queue',
        target: 'emails.outbound',
        count: 2,
      }),
    })
    const body = await res.json()
    check(
      'message move to queue',
      res.status === 200 && body?.moved === 2 && body?.failed === 0,
      JSON.stringify(body),
    )
  }

  console.log('\nOperations hardening')
  {
    const res = await authed('/api/ops/me')
    const body = await res.json()
    check('ops me includes two-person setting', typeof body?.twoPersonApproval === 'boolean')
  }
  {
    const res = await authed('/api/ops/audit')
    const body = await res.json()
    check('ops audit list', res.status === 200 && Array.isArray(body), `${res.status} ${JSON.stringify(body)}`)
    const csv = await authed('/api/ops/audit?format=csv')
    check(
      'ops audit CSV export',
      csv.status === 200 && (csv.headers.get('content-type') ?? '').includes('text/csv'),
      `${csv.status} ${csv.headers.get('content-type')}`,
    )
  }
  {
    const create = await authed('/api/ops/backups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const backup = await create.json()
    check('ops backup create', create.status === 201 && Boolean(backup?.name), `${create.status} ${JSON.stringify(backup)}`)

    const list = await authed('/api/ops/backups')
    const backups = await list.json()
    check('ops backup list', Array.isArray(backups) && backups.length > 0)

    if (backup?.name) {
      const download = await authed(
        `/api/ops/backups/${encodeURIComponent(backup.name)}/download`,
      )
      check(
        'ops backup download',
        download.status === 200 &&
          (download.headers.get('content-type') ?? '').includes('sqlite'),
      )
      const remove = await authed(`/api/ops/backups/${encodeURIComponent(backup.name)}`, {
        method: 'DELETE',
      })
      check('ops backup delete', remove.ok)
    }
  }
  {
    const set = await authed('/api/ops/local-users/e2e-role', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'viewer' }),
    })
    check('ops local role set', set.ok, `${set.status} ${await set.clone().text()}`)
    const list = await authed('/api/ops/local-users')
    const roles = await list.json()
    check(
      'ops local role list',
      Array.isArray(roles) && roles.some((item) => item.username === 'e2e-role'),
    )
    const remove = await authed('/api/ops/local-users/e2e-role', { method: 'DELETE' })
    check('ops local role delete', remove.ok)
  }
  {
    const set = await authed('/api/ops/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ twoPersonApproval: true }),
    })
    const settings = await set.json()
    check('ops two-person setting', settings?.twoPersonApproval === true, `${set.status} ${JSON.stringify(settings)}`)
    await authed('/api/ops/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ twoPersonApproval: false }),
    })
  }
  {
    const targetRes = await authed('/api/ops/targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E target',
        host: 'localhost',
        port: String(MOCK4_PORT),
        protocol: 'http',
        vhost: null,
        username: 'admin',
        password: 'admin',
        enabled: true,
      }),
    })
    const target = await targetRes.json()
    check('ops target create for approvals', targetRes.status === 201 && Boolean(target?.id), JSON.stringify(target))

    const channelRes = await authed('/api/ops/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E Slack',
        type: 'webhook',
        enabled: true,
        config: {
          url: 'https://example.com/hook',
          preset: 'slack',
          method: 'POST',
          headers: {},
          timeoutMs: 10000,
          retries: 0,
          allowPrivate: false,
        },
      }),
    })
    const channel = await channelRes.json()
    check('ops webhook preset create', channelRes.status === 201 && channel?.config?.preset === 'slack', JSON.stringify(channel))

    const ruleRes = await authed('/api/ops/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E escalation rule',
        targetId: target?.id,
        scopeType: 'global',
        scopeValue: '*',
        metric: 'service.reachable',
        operator: '<',
        threshold: 1,
        durationSec: 0,
        severity: 'warning',
        enabled: true,
        channelIds: channel?.id ? [channel.id] : [],
        escalationChannelIds: channel?.id ? [channel.id] : [],
        escalationAfterSec: 60,
        cooldownSec: 900,
      }),
    })
    const rule = await ruleRes.json()
    check(
      'ops rule escalation fields',
      ruleRes.status === 201 && rule?.escalationAfterSec === 60 && rule?.escalationChannelIds?.length === 1,
      JSON.stringify(rule),
    )

    await authed('/api/ops/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ twoPersonApproval: true }),
    })
    await authed('/api/ops/local-users/monitor', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'operator' }),
    })

    const mcpRes = await fetch(`${APP}/api/ops/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer e2e-mcp-token',
      },
      body: JSON.stringify({
        tool: 'mq_create_queue',
        arguments: { target_id: target?.id, vhost: '/', name: 'e2e-approval' },
      }),
    })
    const mcpBody = await mcpRes.json()
    const approvalId = mcpBody?.result?.approvalId
    check('MCP creates write approval', mcpRes.status === 200 && Boolean(approvalId), JSON.stringify(mcpBody))

    if (approvalId) {
      const monitorLogin = await login('monitor', 'monitor')
      const monitorCookie = monitorLogin.cookie.split(';')[0]
      const first = await fetch(`${APP}/api/ops/approvals/${approvalId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: monitorCookie },
        body: JSON.stringify({ action: 'approve' }),
      })
      const firstBody = await first.json()
      check(
        'two-person first approval waits',
        first.status === 200 && firstBody?.result?.pending === true,
        JSON.stringify(firstBody),
      )

      const second = await authed(`/api/ops/approvals/${approvalId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })
      const secondBody = await second.json()
      check(
        'two-person second approval executes',
        second.status === 200 && secondBody?.result?.ok === true,
        JSON.stringify(secondBody),
      )
    }

    await authed('/api/ops/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ twoPersonApproval: false }),
    })
    await authed('/api/ops/local-users/monitor', { method: 'DELETE' })
    if (rule?.id) await authed(`/api/ops/rules/${rule.id}`, { method: 'DELETE' })
    if (channel?.id) await authed(`/api/ops/channels/${channel.id}`, { method: 'DELETE' })
    if (target?.id) await authed(`/api/ops/targets/${target.id}`, { method: 'DELETE' })
  }
  {
    const res = await fetch(`${APP}/api/metrics`)
    const text = await res.text()
    check(
      'Prometheus metrics endpoint',
      res.status === 200 &&
        (res.headers.get('content-type') ?? '').includes('text/plain') &&
        text.includes('hainmq_'),
    )
  }
  {
    const res = await authed('/api/rabbitmq/connections')
    const body = await res.json()
    const named = Array.isArray(body) && body.find((c) => c.client_properties?.connection_name)
    check('connection_name exposed for display [#20]', Boolean(named))
  }
  {
    const res = await authed(
      `/api/rabbitmq/queues/${encodeURIComponent('/')}/orders.created/get`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 5, ackmode: 'ack_requeue_true', encoding: 'auto' }),
      },
    )
    const body = await res.json()
    check('queue message peek', Array.isArray(body) && body.length > 0 && 'payload' in body[0])
  }
  {
    const res = await authed('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vhost: '/', exchange: '', routing_key: 'orders.created', payload: '{"x":1}' }),
    })
    const body = await res.json()
    check('publish via default exchange', res.status === 200 && body?.routed === true, `${res.status} ${body?.error ?? ''}`)
  }
  {
    const res = await authed(`/api/rabbitmq/queues/${encodeURIComponent('/')}/e2e.tmp`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ durable: true, auto_delete: false, arguments: {} }),
    })
    check('queue create (PUT proxies)', res.status === 200 || res.status === 201)
  }
  {
    const res = await authed(`/api/rabbitmq/queues/${encodeURIComponent('/')}/e2e.tmp`, {
      method: 'DELETE',
    })
    check('queue delete (DELETE proxies)', res.ok)
  }
  {
    const res = await authed('/api/auth/logout', { method: 'POST' })
    const c = res.headers.get('set-cookie') ?? ''
    check('logout clears cookie', res.status === 200 && /rmq-session=;|rmq-session=""/.test(c))
  }

  console.log('\nLogin (RabbitMQ ≤3.8 mock — tags as comma string; #23 back-compat)')
  {
    // Point a second app instance at the 3.8-style mock
    start('npx', ['next', 'start', '-p', String(APP_PORT + 1)], {
      RABBITMQ_HOST: 'localhost',
      RABBITMQ_PORT: String(MOCK38_PORT),
      RABBITMQ_PROTOCOL: 'http',
      ...OPS_ENV,
    })
    await waitFor(`http://localhost:${APP_PORT + 1}/api/health`)
    const res = await fetch(`http://localhost:${APP_PORT + 1}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin' }),
    })
    const body = await res.json()
    check(
      'string tags still parse — isAdmin true [#23]',
      res.status === 200 && body?.user?.isAdmin === true && body?.user?.tags?.includes('administrator'),
      JSON.stringify(body?.user),
    )
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exitCode = failed > 0 ? 1 : 0
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => {
    for (const p of procs) {
      try {
        if (process.platform === 'win32') {
          // Kill the whole tree �� shell-spawned children outlive p.kill()
          execSync(`taskkill /pid ${p.pid} /T /F`, { stdio: 'ignore' })
        } else {
          p.kill()
        }
      } catch {
        // already gone
      }
    }
    fs.rmSync(OPS_TMP, { recursive: true, force: true })
    setTimeout(() => process.exit(process.exitCode ?? 0), 500)
  })
