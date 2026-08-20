const FIXED_STORAGE_KEYS = new Set([
  'attendance-blackout-dates',
  'employee-location-overrides',
  'employee-record-overrides',
  'employee-custom-records',
  'hr-attendance-progress-v2',
  'hr-flags',
])

const ATTENDANCE_KEY_PATTERN = /^att-emp-.+-\d{4}$/
const PENDING_STORAGE_KEY = 'attendance-pending-sync-v1'

let saveQueue = Promise.resolve()

function announceSyncStatus(status) {
  window.dispatchEvent(new CustomEvent('attendance-sync-status', { detail: status }))
}

export function isManagedStorageKey(key) {
  return FIXED_STORAGE_KEYS.has(key) || ATTENDANCE_KEY_PATTERN.test(key)
}

export function getLocalManagedEntries() {
  const entries = {}

  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (!key || !isManagedStorageKey(key)) continue
      const rawValue = localStorage.getItem(key)
      if (rawValue === null) continue
      try {
        entries[key] = JSON.parse(rawValue)
      } catch {
        // Ignore malformed legacy cache entries instead of uploading them.
      }
    }
  } catch {
    return {}
  }

  return entries
}

function readPendingWrites() {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_STORAGE_KEY) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

function writePendingWrites(entries) {
  if (Object.keys(entries).length) {
    localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(entries))
  } else {
    localStorage.removeItem(PENDING_STORAGE_KEY)
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body.error || 'The shared attendance service is unavailable.')
    error.status = response.status
    throw error
  }
  return body
}

function replaceManagedCache(entries) {
  const existingKeys = []
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (key && isManagedStorageKey(key)) existingKeys.push(key)
  }
  existingKeys.forEach(key => localStorage.removeItem(key))
  Object.entries(entries || {}).forEach(([key, value]) => {
    if (isManagedStorageKey(key)) localStorage.setItem(key, JSON.stringify(value))
  })
}

export async function loadSharedState(access, { mergeLocal = true } = {}) {
  await flushPendingWrites()
  const localEntries = getLocalManagedEntries()
  let state = await requestJson('/api/state')

  const canMigrate = access?.canManageRoster && access?.canManageBlackouts
  if (mergeLocal && canMigrate && Object.keys(localEntries).length) {
    state = await requestJson('/api/state', {
      method: 'POST',
      body: JSON.stringify({ action: 'merge', entries: localEntries }),
    })
  }

  if (!state.initialized) {
    const error = new Error(
      canMigrate
        ? 'No saved attendance data was found on this device. Sign in as Elizabeth on the device that currently holds the records to complete the one-time shared-data setup.'
        : 'Elizabeth must sign in once on the device that currently holds the attendance records before other users can continue.'
    )
    error.code = 'SHARED_DATA_SETUP_REQUIRED'
    throw error
  }

  replaceManagedCache(state.entries)
  return state
}

export function writeSharedStorage(key, value) {
  if (!isManagedStorageKey(key)) throw new Error(`Unsupported shared storage key: ${key}`)
  localStorage.setItem(key, JSON.stringify(value))

  const pending = readPendingWrites()
  pending[key] = value
  writePendingWrites(pending)
  announceSyncStatus('saving')

  saveQueue = saveQueue
    .catch(() => undefined)
    .then(() => flushPendingWrites())
    .then(() => announceSyncStatus('saved'))
    .catch(() => announceSyncStatus('pending'))

  return value
}

export async function flushPendingWrites() {
  const pending = readPendingWrites()
  const entries = Object.entries(pending)
  if (!entries.length) return

  for (const [key, value] of entries) {
    await requestJson('/api/state', {
      method: 'POST',
      body: JSON.stringify({ action: 'set', key, value }),
      keepalive: true,
    })

    const latestPending = readPendingWrites()
    if (JSON.stringify(latestPending[key]) === JSON.stringify(value)) {
      delete latestPending[key]
      writePendingWrites(latestPending)
    }
  }
}

export async function getServerSession() {
  const response = await fetch('/api/session', { credentials: 'same-origin' })
  if (response.status === 401) return null
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Unable to restore the session.')
  return body.access || null
}

export async function createServerSession(pin) {
  const body = await requestJson('/api/session', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  })
  return body.access
}

export async function endServerSession() {
  await fetch('/api/session', {
    method: 'DELETE',
    credentials: 'same-origin',
  }).catch(() => undefined)
}
