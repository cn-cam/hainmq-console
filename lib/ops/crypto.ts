import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const PREFIX = "v1"

function getKey(): Buffer {
  const raw = process.env.OPS_ENCRYPTION_KEY
  if (!raw) {
    throw new Error("OPS_ENCRYPTION_KEY is not configured")
  }
  const key = Buffer.from(raw, "base64")
  if (key.length !== 32) {
    throw new Error("OPS_ENCRYPTION_KEY must be a base64-encoded 32-byte key")
  }
  return key
}

export function hasEncryptionKey(): boolean {
  try {
    getKey()
    return true
  } catch {
    return false
  }
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [PREFIX, iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":")
}

export function decryptSecret(value: string | null | undefined): string {
  if (!value) return ""
  const [prefix, ivB64, tagB64, dataB64] = value.split(":")
  if (prefix !== PREFIX || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Unsupported encrypted value")
  }
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"))
  decipher.setAuthTag(Buffer.from(tagB64, "base64"))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8")
}

export function maskSecret(value: string | null | undefined): string {
  if (!value) return ""
  return "••••••••"
}
