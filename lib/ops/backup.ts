import fs from "node:fs"
import path from "node:path"
import { getDb } from "./db"

export interface OpsBackup {
  name: string
  size: number
  createdAt: number
}

export function backupDir(): string {
  const dbPath = process.env.OPS_DB_PATH || path.join(process.cwd(), "data", "ops.db")
  return path.join(path.dirname(dbPath), "backups")
}

function ensureDir(): string {
  const dir = backupDir()
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function backupName(): string {
  return `ops-${new Date().toISOString().replace(/[:.]/g, "-")}.db`
}

export function createBackup(): OpsBackup {
  const dir = ensureDir()
  const name = backupName()
  const file = path.join(dir, name)
  const sqlPath = file.replaceAll("\\", "/").replaceAll("'", "''")
  getDb().exec(`VACUUM INTO '${sqlPath}'`)
  const stat = fs.statSync(file)
  return { name, size: stat.size, createdAt: stat.mtimeMs }
}

export function listBackups(): OpsBackup[] {
  const dir = backupDir()
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((name) => /^ops-[A-Za-z0-9._-]+\.db$/.test(name))
    .map((name) => {
      const stat = fs.statSync(path.join(dir, name))
      return { name, size: stat.size, createdAt: stat.mtimeMs }
    })
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function backupPath(name: string): string | null {
  if (!/^ops-[A-Za-z0-9._-]+\.db$/.test(name)) return null
  const file = path.join(backupDir(), name)
  return fs.existsSync(file) ? file : null
}

export function deleteBackup(name: string): boolean {
  const file = backupPath(name)
  if (!file) return false
  fs.unlinkSync(file)
  return true
}

export function stageRestore(name: string): boolean {
  const file = backupPath(name)
  if (!file) return false
  const dbPath = process.env.OPS_DB_PATH || path.join(process.cwd(), "data", "ops.db")
  fs.copyFileSync(file, `${dbPath}.restore-pending`)
  return true
}

export function pruneBackups(retentionDays: number): number {
  const cutoff = Date.now() - Math.max(1, retentionDays) * 24 * 60 * 60 * 1000
  let removed = 0
  for (const backup of listBackups()) {
    if (backup.createdAt < cutoff) {
      try {
        fs.unlinkSync(path.join(backupDir(), backup.name))
        removed += 1
      } catch {
        // Keep the backup if it cannot be removed.
      }
    }
  }
  return removed
}
