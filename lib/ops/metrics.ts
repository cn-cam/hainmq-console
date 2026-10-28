import type { RuleOperator, ScopeType } from "./types"

export interface MetricDefinition {
  key: string
  objectType: ScopeType
  label: string
  labelZh: string
  unit: string
  description: string
  descriptionZh: string
  defaultOperator: RuleOperator
  defaultThreshold: number
}

export const METRICS: MetricDefinition[] = [
  {
    key: "service.reachable",
    objectType: "global",
    label: "Service reachable",
    labelZh: "服务可达",
    unit: "0/1",
    description: "1 when the Management API responds, 0 otherwise",
    descriptionZh: "Management API 可访问为 1，不可访问为 0",
    defaultOperator: "<",
    defaultThreshold: 1,
  },
  {
    key: "service.response_ms",
    objectType: "global",
    label: "API response time",
    labelZh: "API 响应时间",
    unit: "ms",
    description: "Management API response time in milliseconds",
    descriptionZh: "Management API 响应时间（毫秒）",
    defaultOperator: ">",
    defaultThreshold: 3000,
  },
  {
    key: "node.mem_alarm",
    objectType: "global",
    label: "Memory alarm",
    labelZh: "内存告警",
    unit: "0/1",
    description: "1 when the broker memory alarm is active",
    descriptionZh: "Broker 内存告警生效时为 1",
    defaultOperator: ">",
    defaultThreshold: 0,
  },
  {
    key: "node.disk_alarm",
    objectType: "global",
    label: "Disk alarm",
    labelZh: "磁盘告警",
    unit: "0/1",
    description: "1 when the broker disk free alarm is active",
    descriptionZh: "Broker 磁盘可用空间告警生效时为 1",
    defaultOperator: ">",
    defaultThreshold: 0,
  },
  {
    key: "node.mem_used",
    objectType: "global",
    label: "Node memory used",
    labelZh: "节点内存使用",
    unit: "bytes",
    description: "Memory used by the node",
    descriptionZh: "节点已使用内存",
    defaultOperator: ">",
    defaultThreshold: 0,
  },
  {
    key: "node.disk_free",
    objectType: "global",
    label: "Node disk free",
    labelZh: "节点磁盘可用",
    unit: "bytes",
    description: "Free disk space on the node",
    descriptionZh: "节点可用磁盘空间",
    defaultOperator: "<",
    defaultThreshold: 0,
  },
  {
    key: "node.fd_used_ratio",
    objectType: "global",
    label: "File descriptor usage",
    labelZh: "文件描述符使用率",
    unit: "%",
    description: "Used file descriptors as a percentage of the total",
    descriptionZh: "已用文件描述符占总量的百分比",
    defaultOperator: ">",
    defaultThreshold: 80,
  },
  {
    key: "node.sockets_used_ratio",
    objectType: "global",
    label: "Socket usage",
    labelZh: "Socket 使用率",
    unit: "%",
    description: "Used sockets as a percentage of the total",
    descriptionZh: "已用 Socket 占总量的百分比",
    defaultOperator: ">",
    defaultThreshold: 80,
  },
  {
    key: "overview.connections",
    objectType: "global",
    label: "Connections",
    labelZh: "连接数",
    unit: "count",
    description: "Current connection count",
    descriptionZh: "当前连接数",
    defaultOperator: ">",
    defaultThreshold: 0,
  },
  {
    key: "overview.channels",
    objectType: "global",
    label: "Channels",
    labelZh: "通道数",
    unit: "count",
    description: "Current channel count",
    descriptionZh: "当前通道数",
    defaultOperator: ">",
    defaultThreshold: 0,
  },
  {
    key: "overview.consumers",
    objectType: "global",
    label: "Consumers",
    labelZh: "消费者数",
    unit: "count",
    description: "Current consumer count",
    descriptionZh: "当前消费者数",
    defaultOperator: "<",
    defaultThreshold: 1,
  },
  {
    key: "overview.queues",
    objectType: "global",
    label: "Queues",
    labelZh: "队列数",
    unit: "count",
    description: "Current queue count",
    descriptionZh: "当前队列数",
    defaultOperator: ">",
    defaultThreshold: 0,
  },
  {
    key: "message.publish_rate",
    objectType: "global",
    label: "Publish rate",
    labelZh: "发布速率",
    unit: "/s",
    description: "Messages published per second",
    descriptionZh: "每秒发布消息数",
    defaultOperator: "<",
    defaultThreshold: 1,
  },
  {
    key: "message.deliver_rate",
    objectType: "global",
    label: "Deliver rate",
    labelZh: "投递速率",
    unit: "/s",
    description: "Messages delivered per second",
    descriptionZh: "每秒投递消息数",
    defaultOperator: "<",
    defaultThreshold: 1,
  },
  {
    key: "message.redelivered_rate",
    objectType: "global",
    label: "Redelivered rate",
    labelZh: "重投递速率",
    unit: "/s",
    description: "Messages redelivered per second",
    descriptionZh: "每秒重投递消息数",
    defaultOperator: ">",
    defaultThreshold: 1,
  },
  {
    key: "message.unroutable_rate",
    objectType: "global",
    label: "Unroutable rate",
    labelZh: "不可路由速率",
    unit: "/s",
    description: "Unroutable messages per second",
    descriptionZh: "每秒不可路由消息数",
    defaultOperator: ">",
    defaultThreshold: 0,
  },
  {
    key: "queue.messages",
    objectType: "queue",
    label: "Queue messages",
    labelZh: "队列消息数",
    unit: "count",
    description: "Total messages in the queue",
    descriptionZh: "队列中的消息总数",
    defaultOperator: ">",
    defaultThreshold: 10000,
  },
  {
    key: "queue.messages_without_consumers",
    objectType: "queue",
    label: "Messages without consumers",
    labelZh: "无消费者消息数",
    unit: "count",
    description: "Messages in a queue that currently has no consumers",
    descriptionZh: "当前没有消费者时队列中的消息数",
    defaultOperator: ">",
    defaultThreshold: 0,
  },
  {
    key: "queue.messages_ready",
    objectType: "queue",
    label: "Ready messages",
    labelZh: "就绪消息数",
    unit: "count",
    description: "Messages ready for delivery",
    descriptionZh: "可投递的就绪消息数",
    defaultOperator: ">",
    defaultThreshold: 10000,
  },
  {
    key: "queue.messages_unacked",
    objectType: "queue",
    label: "Unacked messages",
    labelZh: "未确认消息数",
    unit: "count",
    description: "Messages delivered but not acknowledged",
    descriptionZh: "已投递但未确认的消息数",
    defaultOperator: ">",
    defaultThreshold: 1000,
  },
  {
    key: "queue.consumers",
    objectType: "queue",
    label: "Queue consumers",
    labelZh: "队列消费者数",
    unit: "count",
    description: "Consumers attached to the queue",
    descriptionZh: "队列上的消费者数量",
    defaultOperator: "==",
    defaultThreshold: 0,
  },
  {
    key: "queue.consumer_utilisation",
    objectType: "queue",
    label: "Consumer utilisation",
    labelZh: "消费者利用率",
    unit: "ratio",
    description: "Consumer utilisation ratio (0-1)",
    descriptionZh: "消费者利用率（0-1）",
    defaultOperator: "<",
    defaultThreshold: 0.1,
  },
  {
    key: "queue.publish_rate",
    objectType: "queue",
    label: "Queue publish rate",
    labelZh: "队列发布速率",
    unit: "/s",
    description: "Messages published to the queue per second",
    descriptionZh: "每秒发布到队列的消息数",
    defaultOperator: "<",
    defaultThreshold: 1,
  },
  {
    key: "queue.deliver_rate",
    objectType: "queue",
    label: "Queue deliver rate",
    labelZh: "队列投递速率",
    unit: "/s",
    description: "Messages delivered from the queue per second",
    descriptionZh: "每秒从队列投递的消息数",
    defaultOperator: "<",
    defaultThreshold: 1,
  },
  {
    key: "queue.memory",
    objectType: "queue",
    label: "Queue memory",
    labelZh: "队列内存",
    unit: "bytes",
    description: "Memory used by the queue",
    descriptionZh: "队列占用的内存",
    defaultOperator: ">",
    defaultThreshold: 0,
  },
  {
    key: "queue.state",
    objectType: "queue",
    label: "Queue running",
    labelZh: "队列运行状态",
    unit: "0/1",
    description: "1 when the queue state is running, 0 otherwise",
    descriptionZh: "队列状态为 running 时为 1，否则为 0",
    defaultOperator: "<",
    defaultThreshold: 1,
  },
  {
    key: "exchange.publish_in_rate",
    objectType: "exchange",
    label: "Exchange publish-in rate",
    labelZh: "交换机入站速率",
    unit: "/s",
    description: "Messages published into the exchange per second",
    descriptionZh: "每秒进入交换机的消息数",
    defaultOperator: "<",
    defaultThreshold: 1,
  },
  {
    key: "exchange.publish_out_rate",
    objectType: "exchange",
    label: "Exchange publish-out rate",
    labelZh: "交换机出站速率",
    unit: "/s",
    description: "Messages published out of the exchange per second",
    descriptionZh: "每秒离开交换机的消息数",
    defaultOperator: "<",
    defaultThreshold: 1,
  },
]

export const METRIC_MAP = new Map(METRICS.map((metric) => [metric.key, metric]))

export function getMetricDefinition(key: string): MetricDefinition | undefined {
  return METRIC_MAP.get(key)
}

export function compareValue(value: number, operator: RuleOperator, threshold: number): boolean {
  switch (operator) {
    case ">":
      return value > threshold
    case ">=":
      return value >= threshold
    case "<":
      return value < threshold
    case "<=":
      return value <= threshold
    case "==":
      return value === threshold
    case "!=":
      return value !== threshold
    case "absent":
      return false
    default:
      return false
  }
}

export function matchScope(scopeValue: string, objectName: string): boolean {
  if (!scopeValue || scopeValue === "*") return true

  const shortName = objectName.includes("/")
    ? objectName.slice(objectName.indexOf("/") + 1)
    : objectName

  const matches = (pattern: string, candidate: string) => {
    if (pattern.endsWith("*")) return candidate.startsWith(pattern.slice(0, -1))
    return pattern === candidate
  }

  return matches(scopeValue, objectName) || matches(scopeValue, shortName)
}
