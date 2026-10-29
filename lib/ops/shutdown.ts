import { closeDb } from "./db"

export function registerOpsShutdown() {
  if (globalThis.__opsShutdownRegistered) return
  globalThis.__opsShutdownRegistered = true

  const shutdown = () => {
    closeDb()
    process.exit(0)
  }
  process.once("SIGTERM", shutdown)
  process.once("SIGINT", shutdown)
}

declare global {
  var __opsShutdownRegistered: boolean | undefined
}
