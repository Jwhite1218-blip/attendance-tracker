import { applyStateMutation, createStateMutation, isEmptyStateMutation } from './stateMutations.js'

const FIXED_STORAGE_KEYS = new Set([
  'attendance-blackout-dates',
  'employee-location-overrides',
  'employee-record-overrides',
  'employee-manager-notes-v1',
  'employee-custom-records',
  'all-star-recognition-v1',
  'hr-attendance-progress-v2',
  'hr-flags',
])

const ATTENDANCE_KEY_PATTERN = /^att-emp-.+-\d{4}$/
const PENDING_STORAGE_KEY = 'attendance-pending-sync-v1'
export const ROSTER_SESSION_KEY = 'attendance-source-roster-v1'

let saveQueue = Promise.resolve()
let activeFlush = null
let clientAccess = null

function announceSyncStatus(status) {
  window.dispatchEvent(new CustomEvent('attendance-sync-status', { detail: status }))
}

export function isManagedStorageKey(key) {
  return FIXED_STORAGE_KEYS.has(key) || ATTENDANCE_KEY_PATTERN.test(key)
}

export function configureClientAccess(access) {
  clientAccess = access || null
}

export function canWriteManagedKeyForAccess(access, key) {
  if (!access) return false
  if (ATTENDANCE_KEY_PATTERN.test(key) || key === 'hr-attendance-progress-v2' || key === 'hr-flags') {
    return access.canEditAttendance !== false
  }
  if (key === 'all-star-recognition-v1') {
    return (access.role === 'admin' || access.role === 'school')
      && access.canEditRecognition === true
  }
  if (key === 'attendance-blackout-dates') return access.canManageBlackouts === true
  if (key === 'employee-location-overrides') return access.canManageRoster === true
  if (key === 'employee-manager-notes-v1') return access.canWriteEmployeeNotes === true
  if (key === 'employee-record-overrides' || key === 'employee-custom-records') {
    return access.role === 'admin'
      && access.canManageRoster === true
      && access.canManageBlackouts === true
  }
  return false
}

function canWriteManagedKey(key) {
  return canWriteManagedKeyForAccess(clientAccess, key)
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

function replaceRosterCache(roster) {
  sessionStorage.setItem(ROSTER_SESSION_KEY, JSON.stringify(Array.isArray(roster) ? roster : []))
}

export function clearClientDataCache() {
  const existingKeys = []
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (key && isManagedStorageKey(key)) existingKeys.push(key)
  }
  existingKeys.forEach(key => localStorage.removeItem(key))
  sessionStorage.removeItem(ROSTER_SESSION_KEY)
}

export async function loadSharedState() {
  await flushPendingWrites()
  const state = await requestJson('/api/state')

  if (!state.initialized) {
    const error = new Error('Shared attendance data has not been initialized. Contact the system administrator before entering records.')
    error.code = 'SHARED_DATA_SETUP_REQUIRED'
    throw error
  }

  replaceManagedCache(state.entries)
  replaceRosterCache(state.roster)
  return state
}

export function writeSharedStorage(key, value) {
  if (!isManagedStorageKey(key)) throw new Error(`Unsupported shared storage key: ${key}`)
  if (!canWriteManagedKey(key)) throw new Error('This session is read-only for that information.')
  const previousRaw = localStorage.getItem(key)
  let previousValue = null
  try {
    previousValue = previousRaw === null ? null : JSON.parse(previousRaw)
  } catch {
    previousValue = null
  }
  localStorage.setItem(key, JSON.stringify(value))

  const pending = readPendingWrites()
  const existing = pending[key]
  pending[key] = {
    version: 2,
    base: existing?.version === 2 ? existing.base : previousValue,
    value,
  }
  writePendingWrites(pending)
  announceSyncStatus('saving')

  saveQueue = saveQueue
    .catch(() => undefined)
    .then(() => flushPendingWrites())
    .then(() => announceSyncStatus('saved'))
    .catch(() => announceSyncStatus('pending'))

  return value
}

async function performPendingFlush() {
  const pending = readPendingWrites()
  const entries = Object.entries(pending)
  if (!entries.length) return

  for (const [key, rawPending] of entries) {
    if (key === 'all-star-recognition-v1' && !canWriteManagedKey(key)) {
      const latestPending = readPendingWrites()
      if (JSON.stringify(latestPending[key]) === JSON.stringify(rawPending)) {
        delete latestPending[key]
        writePendingWrites(latestPending)
      }
      continue
    }
    if (rawPending?.version !== 2) {
      const latestPending = readPendingWrites()
      if (JSON.stringify(latestPending[key]) === JSON.stringify(rawPending)) {
        delete latestPending[key]
        writePendingWrites(latestPending)
      }
      continue
    }
    const sent = rawPending
    const mutation = createStateMutation(key, sent.base, sent.value)
    if (isEmptyStateMutation(mutation)) {
      const latestPending = readPendingWrites()
      if (JSON.stringify(latestPending[key]) === JSON.stringify(rawPending)) {
        delete latestPending[key]
        writePendingWrites(latestPending)
      }
      continue
    }

    const response = await requestJson('/api/state', {
      method: 'POST',
      body: JSON.stringify({ action: 'mutate', key, mutation }),
      keepalive: true,
    })

    const latestPending = readPendingWrites()
    if (JSON.stringify(latestPending[key]) === JSON.stringify(rawPending)) {
      delete latestPending[key]
      writePendingWrites(latestPending)
      localStorage.setItem(key, JSON.stringify(response.value))
    } else if (latestPending[key]?.version === 2) {
      const laterMutation = createStateMutation(key, sent.value, latestPending[key].value)
      const rebasedValue = applyStateMutation(key, response.value, laterMutation)
      latestPending[key] = { version: 2, base: response.value, value: rebasedValue }
      writePendingWrites(latestPending)
      localStorage.setItem(key, JSON.stringify(rebasedValue))
    }
  }
}

export function flushPendingWrites() {
  if (!activeFlush) {
    activeFlush = performPendingFlush().finally(() => { activeFlush = null })
  }
  return activeFlush
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
  let pendingWasFlushed = false
  try {
    await flushPendingWrites()
    pendingWasFlushed = true
    await fetch('/api/session', {
      method: 'DELETE',
      credentials: 'same-origin',
    })
  } catch {
    // The local cache is still cleared even if the network is unavailable.
  } finally {
    clearClientDataCache()
    if (pendingWasFlushed) localStorage.removeItem(PENDING_STORAGE_KEY)
  }
}
