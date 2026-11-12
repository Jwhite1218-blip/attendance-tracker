import { applyStateMutation, createStateMutation, isEmptyStateMutation } from './stateMutations.js'

const FIXED_STORAGE_KEYS = new Set([
  'attendance-blackout-dates',
  'employee-location-overrides',
  'employee-record-overrides',
  'employee-manager-notes-v1',
  'employee-custom-records',
  'employee-assignment-history-v1',
  'all-star-recognition-v1',
  'star-card-prints-v1',
  'training-records-v1',
  'program-settings-v1',
  'pending-approvals-v1',
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
  // Mirrors canWriteStateKey on the server: an area this login cannot see is
  // an area it cannot write. Kept first so every rule below inherits it.
  if (access.canViewAttendance === false && (
    ATTENDANCE_KEY_PATTERN.test(key)
    || key === 'hr-attendance-progress-v2'
    || key === 'hr-flags'
    || key === 'employee-manager-notes-v1'
  )) return false
  if (access.canViewTraining === false && key === 'training-records-v1') return false
  if (access.canViewBlackouts === false && key === 'attendance-blackout-dates') return false
  if (ATTENDANCE_KEY_PATTERN.test(key) || key === 'hr-attendance-progress-v2' || key === 'hr-flags') {
    return access.canEditAttendance !== false
  }
  // Printed star cards are part of recording recognition: the kitchen that
  // can give a star can mark its card printed. The rows are narrowed to
  // that kitchen on the server, the same way recognition itself is.
  if (key === 'all-star-recognition-v1' || key === 'star-card-prints-v1') {
    return (access.role === 'admin' || access.role === 'school')
      && access.canEditRecognition === true
  }
  if (key === 'attendance-blackout-dates') return access.canManageBlackouts === true
  // A transfer writes the location override and the history entry together,
  // so they share one permission — see ROSTER_KEYS in permissions.mjs. Both
  // sit at Liz's tier since 2026-10-19: a limited administrator proposes a
  // transfer rather than making one.
  if (key === 'employee-location-overrides' || key === 'employee-assignment-history-v1') {
    return access.role === 'admin'
      && access.canManageRoster === true
      && access.canManageBlackouts === true
  }
  // The queue of roster changes awaiting Liz. Open to any administrator,
  // not just roster-holders: the ones it exists for are those without roster
  // rights, who have no other way to get a card changed.
  if (key === 'pending-approvals-v1') {
    return access.role === 'admin' && access.recognitionOnly !== true
  }
  if (key === 'training-records-v1') {
    return access.role === 'admin' && access.canManageRoster === true
  }
  // Program settings decide discipline stages and compliance hours for the
  // whole district, so they sit at Liz's tier rather than any administrator.
  if (key === 'program-settings-v1') {
    return access.role === 'admin'
      && access.canManageRoster === true
      && access.canManageBlackouts === true
  }
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

// The same write, awaited.
//
// Liz, 2026-10-27: an administrator submitted a request, their screen said
// "Sent to Liz for review", and nothing had been sent — the database was
// refusing the write and the flush is asynchronous, so the message went up
// before anything had happened. A confirmation that cannot be wrong is
// worth more than one that appears instantly.
//
// Use this wherever the screen is about to tell somebody their change is
// safe. Everywhere else the fire-and-forget version is right: a marked
// attendance day should not block on the network.
export function writeSharedStorageConfirmed(key, value) {
  return writeSharedStorage(key, value, { confirmed: true })
}

export function writeSharedStorage(key, value, { confirmed = false } = {}) {
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

  // Split in two so a caller can await the flush itself and see it fail.
  // saveQueue still swallows the error — the badge reports it — so the
  // rejection below is always handled even when nobody is awaiting it.
  const flushed = saveQueue
    .catch(() => undefined)
    .then(() => flushPendingWrites())

  saveQueue = flushed
    .then(discarded => announceSyncStatus(discarded?.length ? 'pending' : 'saved'))
    .catch(() => announceSyncStatus('pending'))

  if (!confirmed) return value

  // Throwing here is safe in a way it would not be inside the flush loop:
  // the entry has already been removed from the queue, so nothing is left
  // to retry and nothing behind it is blocked. That was the 2026-10-19
  // failure and this does not reintroduce it.
  return flushed.then(discarded => {
    const refused = (discarded || []).find(entry => entry.key === key)
    if (refused) {
      const error = new Error(
        refused.message || 'The server would not accept that change. Nothing has been saved.'
      )
      error.status = refused.status
      throw error
    }
    return value
  })
}

// Returns the keys whose writes were thrown away because the server
// refused them. Dropping a 4xx is right — see the catch below — but until
// 2026-10-27 nothing above this line could tell that it had happened, so a
// screen could say "Sent to Liz for review" about a write the database had
// rejected. The drop is unchanged; it is now reported.
async function performPendingFlush() {
  const discarded = []
  const pending = readPendingWrites()
  const entries = Object.entries(pending)
  if (!entries.length) return discarded

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

    let response
    try {
      response = await requestJson('/api/state', {
        method: 'POST',
        body: JSON.stringify({ action: 'mutate', key, mutation }),
        keepalive: true,
      })
    } catch (error) {
      // A 4xx will never succeed however many times it is retried — a key
      // the server does not admit, or one this session may not write. Left
      // in the queue it is retried on every sign-in, throws every time, and
      // because that throw escapes this loop it also blocks every write
      // queued behind it. That is how a missing migration became "the
      // shared attendance service is temporarily unavailable" for a whole
      // sign-in on 2026-10-19.
      //
      // So it is dropped, loudly. Losing one rejected change is bad; losing
      // the ability to sign in, and silently freezing every later write, is
      // worse.
      if (error?.status >= 400 && error.status < 500) {
        console.error(JSON.stringify({
          event: 'pending-write-discarded',
          key,
          status: error.status,
          message: error.message,
        }))
        const latestPending = readPendingWrites()
        if (JSON.stringify(latestPending[key]) === JSON.stringify(rawPending)) {
          delete latestPending[key]
          writePendingWrites(latestPending)
        }
        discarded.push({ key, status: error.status, message: error.message })
        continue
      }
      // A 5xx really might clear up. Leave it queued and try again later.
      throw error
    }

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

  return discarded
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

// username is empty for the fifteen building logins and for every
// administrator Liz has not opted in, and the server treats empty as
// "PIN only" — the behaviour every login had before 2026-10-26.
export async function createServerSession(pin, username = '') {
  const body = await requestJson('/api/session', {
    method: 'POST',
    body: JSON.stringify({ pin, username }),
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
