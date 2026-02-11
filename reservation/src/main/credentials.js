import { safeStorage } from 'electron'
import { getDatabase } from './database.js'

export function saveCredential(platform, data) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available on this system')
  }
  const jsonString = JSON.stringify(data)
  const encrypted = safeStorage.encryptString(jsonString)
  const db = getDatabase()
  db.prepare(`
    INSERT INTO credentials (platform, encrypted_data, validated_at)
    VALUES (?, ?, NULL)
    ON CONFLICT(platform) DO UPDATE SET encrypted_data = ?, validated_at = NULL
  `).run(platform, encrypted, encrypted)
}

export function getCredential(platform) {
  const db = getDatabase()
  const row = db.prepare('SELECT encrypted_data FROM credentials WHERE platform = ?').get(platform)
  if (!row || !row.encrypted_data) return null
  try {
    const decrypted = safeStorage.decryptString(Buffer.from(row.encrypted_data))
    return JSON.parse(decrypted)
  } catch (err) {
    console.error(`Failed to decrypt credentials for ${platform}:`, err.message)
    return null
  }
}

export function deleteCredential(platform) {
  const db = getDatabase()
  db.prepare('DELETE FROM credentials WHERE platform = ?').run(platform)
}

export function getCredentialStatus(platform) {
  const db = getDatabase()
  const row = db.prepare('SELECT validated_at FROM credentials WHERE platform = ?').get(platform)
  return {
    exists: !!row,
    validated_at: row ? row.validated_at : null
  }
}

export function getAllCredentialStatuses() {
  const db = getDatabase()
  const rows = db.prepare('SELECT platform, validated_at FROM credentials').all()
  const statuses = {}
  for (const p of ['Resy', 'Tock', 'OpenTable']) {
    const row = rows.find(r => r.platform === p)
    statuses[p] = { exists: !!row, validated_at: row ? row.validated_at : null }
  }
  return statuses
}

export function markValidated(platform) {
  const db = getDatabase()
  db.prepare("UPDATE credentials SET validated_at = datetime('now') WHERE platform = ?").run(platform)
}
