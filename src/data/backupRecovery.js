export const BACKUP_FORMAT = 'warren-attendance-backup'
export const BACKUP_VERSION = 1
export const BACKUP_MAX_BYTES = 25 * 1024 * 1024

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

export function validateBackupEnvelope(backup) {
  if (
    !plainObject(backup)
    || backup.format !== BACKUP_FORMAT
    || backup.version !== BACKUP_VERSION
    || !plainObject(backup.entries)
  ) {
    throw new Error('That file is not a supported Warren attendance backup.')
  }
  if (!backup.exportedAt || Number.isNaN(Date.parse(backup.exportedAt))) {
    throw new Error('That backup does not have a valid export date.')
  }
  return {
    exportedAt: backup.exportedAt,
    exportedBy: String(backup.exportedBy || 'Liz administrator'),
    sectionCount: Object.keys(backup.entries).length,
  }
}

export function parseBackupText(text) {
  let backup
  try {
    backup = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  validateBackupEnvelope(backup)
  return backup
}

export function backupFilename(date = new Date()) {
  const stamp = date.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `warren-attendance-backup-${stamp}.json`
}

async function responseJson(response, fallbackMessage) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || fallbackMessage)
  return body
}

export async function fetchFullBackup() {
  const response = await fetch('/api/state?action=backup', { credentials: 'same-origin' })
  const backup = await responseJson(response, 'Unable to create the backup right now.')
  validateBackupEnvelope(backup)
  return backup
}

export async function downloadFullBackup() {
  const backup = await fetchFullBackup()
  const filename = backupFilename(new Date(backup.exportedAt))
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return { backup, filename, ...validateBackupEnvelope(backup) }
}

export async function readBackupFile(file) {
  if (!file) throw new Error('Choose a backup file first.')
  if (file.size > BACKUP_MAX_BYTES) throw new Error('That backup file is too large.')
  return parseBackupText(await file.text())
}

// The one-time re-key — see src/data/rekey.js. A preview unless confirm is
// set, so the screen can show what will move before anything does.
export async function requestRekey({ confirm = false, confirmation = '' } = {}) {
  const response = await fetch('/api/state', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'rekey', confirm, confirmation }),
  })
  return responseJson(response, 'Unable to reach the re-key right now.')
}

export async function restoreFullBackup(backup, confirmation) {
  validateBackupEnvelope(backup)
  const response = await fetch('/api/state', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'restore-backup', confirmation, backup }),
  })
  return responseJson(response, 'Unable to restore the backup right now.')
}
