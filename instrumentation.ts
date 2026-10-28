export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const { startOpsScheduler } = await import("./lib/ops/scheduler")
  startOpsScheduler()
}
