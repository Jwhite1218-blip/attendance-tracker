import employees from '../../src/data/employees.json'
import { jsonResponse, sessionFromRequest } from './_shared/auth.mjs'
import { getStateStore } from './_shared/state-store.mjs'
import {
  BLACKOUTS_KEY,
  CUSTOM_EMPLOYEES_KEY,
  HR_STATUS_KEY,
  LEGACY_HR_STATUS_KEY,
  LOCATION_OVERRIDES_KEY,
  RECORD_OVERRIDES_KEY,
  ROSTER_KEYS,
  attendanceEmployeeId,
  canWriteStateKey,
  filterStatusesForEmployees,
  isManagedStateKey,
  mergeSchoolStatuses,
} from './_shared/permissions.mjs'

const META_KEY = '__state_meta__'

function employeeKey(employee) {
  return String(employee?.kronos_id || employee?.id || '')
}

async function loadEntries(store) {
  const { blobs } = await store.list()
  const rows = await Promise.all(
    blobs
      .filter(blob => blob.key !== META_KEY && isManagedStateKey(blob.key))
      .map(async blob => [blob.key, await store.get(blob.key, { type: 'json' })])
  )
  return Object.fromEntries(rows.filter(([, value]) => value !== null))
}

function allowedEmployeeIdsForSchool(entries, locationId) {
  const locationOverrides = entries[LOCATION_OVERRIDES_KEY] || {}
  const recordOverrides = entries[RECORD_OVERRIDES_KEY] || {}
  const customEmployees = Array.isArray(entries[CUSTOM_EMPLOYEES_KEY])
    ? entries[CUSTOM_EMPLOYEES_KEY]
    : []

  return new Set(
    [...employees, ...customEmployees]
      .filter(employee => {
        const key = employeeKey(employee)
        const recordOverride = recordOverrides[key] || {}
        const effectiveLocation = locationOverrides[key] || recordOverride.location || employee.location
        return effectiveLocation === locationId
      })
      .map(employeeKey)
  )
}

function filterRecordMap(records, allowedEmployeeIds) {
  return Object.fromEntries(
    Object.entries(records || {}).filter(([employeeId]) => allowedEmployeeIds.has(String(employeeId)))
  )
}

function filterEntriesForSession(entries, session) {
  if (session.role === 'admin') return entries

  const allowedEmployeeIds = allowedEmployeeIdsForSchool(entries, session.locationId)
  const filtered = {}

  if (entries[BLACKOUTS_KEY]) filtered[BLACKOUTS_KEY] = entries[BLACKOUTS_KEY]
  if (entries[LOCATION_OVERRIDES_KEY]) filtered[LOCATION_OVERRIDES_KEY] = entries[LOCATION_OVERRIDES_KEY]
  if (entries[RECORD_OVERRIDES_KEY]) {
    filtered[RECORD_OVERRIDES_KEY] = filterRecordMap(entries[RECORD_OVERRIDES_KEY], allowedEmployeeIds)
  }
  if (Array.isArray(entries[CUSTOM_EMPLOYEES_KEY])) {
    filtered[CUSTOM_EMPLOYEES_KEY] = entries[CUSTOM_EMPLOYEES_KEY]
      .filter(employee => allowedEmployeeIds.has(employeeKey(employee)))
  }
  if (entries[HR_STATUS_KEY]) {
    filtered[HR_STATUS_KEY] = filterStatusesForEmployees(entries[HR_STATUS_KEY], allowedEmployeeIds)
  }
  if (entries[LEGACY_HR_STATUS_KEY]) {
    filtered[LEGACY_HR_STATUS_KEY] = filterStatusesForEmployees(entries[LEGACY_HR_STATUS_KEY], allowedEmployeeIds)
  }

  Object.entries(entries).forEach(([key, value]) => {
    const attendanceId = attendanceEmployeeId(key)
    if (attendanceId && allowedEmployeeIds.has(String(attendanceId))) filtered[key] = value
  })

  return filtered
}

function mergeArrays(key, localValue, serverValue) {
  const identity = key === BLACKOUTS_KEY
    ? item => String(item?.date || '')
    : item => employeeKey(item)
  const merged = new Map()
  for (const item of Array.isArray(localValue) ? localValue : []) merged.set(identity(item), item)
  for (const item of Array.isArray(serverValue) ? serverValue : []) merged.set(identity(item), item)
  merged.delete('')
  return [...merged.values()]
}

function mergeImportedValue(key, localValue, serverValue) {
  if (serverValue === undefined || serverValue === null) return localValue
  if (key === BLACKOUTS_KEY || key === CUSTOM_EMPLOYEES_KEY) {
    return mergeArrays(key, localValue, serverValue)
  }
  if (
    localValue && serverValue &&
    typeof localValue === 'object' && !Array.isArray(localValue) &&
    typeof serverValue === 'object' && !Array.isArray(serverValue)
  ) {
    return { ...localValue, ...serverValue }
  }
  return serverValue
}

// Merges an incoming write into the value currently stored for that key, instead of blindly
// replacing it. Every "set" write is a read-modify-write of a whole blob (a year of one
// employee's attendance, a roster-override map, etc.) computed from whatever the client last
// synced — without this, two edits to the same key made around the same time silently destroy
// each other, since whichever write lands second simply overwrites the first in full.
function mergeIncomingValue(key, currentValue, incomingValue) {
  if (incomingValue === undefined) return currentValue
  if (key === BLACKOUTS_KEY || key === CUSTOM_EMPLOYEES_KEY) {
    return mergeArrays(key, currentValue, incomingValue)
  }
  if (
    currentValue && incomingValue &&
    typeof currentValue === 'object' && !Array.isArray(currentValue) &&
    typeof incomingValue === 'object' && !Array.isArray(incomingValue)
  ) {
    return { ...currentValue, ...incomingValue }
  }
  return incomingValue
}

async function handleSet(store, entries, session, body) {
  const key = String(body.key || '')
  const allowedEmployeeIds = session.role === 'school'
    ? allowedEmployeeIdsForSchool(entries, session.locationId)
    : new Set()

  if (!isManagedStateKey(key) || !canWriteStateKey(session, key, allowedEmployeeIds)) {
    return jsonResponse({ error: 'You do not have permission to make that change.' }, 403)
  }

  // Re-read the current value immediately before merging, rather than relying solely on the
  // whole-state snapshot loaded at the top of the request — this narrows the window in which a
  // concurrent write to this same key could be missed.
  const currentValue = await store.get(key, { type: 'json' })

  let value = body.value
  if (session.role === 'school' && (key === HR_STATUS_KEY || key === LEGACY_HR_STATUS_KEY)) {
    value = mergeSchoolStatuses(currentValue, value, allowedEmployeeIds)
  } else {
    value = mergeIncomingValue(key, currentValue, value)
  }

  await store.setJSON(key, value, session.displayName || 'authenticated user')
  entries[key] = value
  return jsonResponse({ ok: true })
}

async function handleMerge(store, entries, session, body) {
  if (session.role !== 'admin' || !session.canManageRoster || !session.canManageBlackouts) {
    return jsonResponse({ error: 'Only Elizabeth can complete shared-data migration.' }, 403)
  }

  const incoming = body.entries && typeof body.entries === 'object' && !Array.isArray(body.entries)
    ? body.entries
    : {}

  for (const [key, localValue] of Object.entries(incoming)) {
    if (!isManagedStateKey(key)) continue
    const value = mergeImportedValue(key, localValue, entries[key])
    await store.setJSON(key, value, session.displayName || 'district administrator')
    entries[key] = value
  }

  if (Object.keys(entries).length) {
    await store.setJSON(META_KEY, {
      initializedAt: new Date().toISOString(),
      initializedBy: session.displayName || 'district administrator',
    }, session.displayName || 'district administrator')
  }

  return jsonResponse({
    initialized: Object.keys(entries).length > 0,
    entries: filterEntriesForSession(entries, session),
  })
}

export default async request => {
  const session = sessionFromRequest(request)
  if (!session) return jsonResponse({ error: 'Authentication required.' }, 401)

  const store = getStateStore()
  const [entries, meta] = await Promise.all([
    loadEntries(store),
    store.get(META_KEY, { type: 'json' }),
  ])

  if (request.method === 'GET') {
    return jsonResponse({
      initialized: Boolean(meta),
      entries: filterEntriesForSession(entries, session),
    })
  }

  if (request.method === 'POST') {
    const parsedBody = await request.json().catch(() => null)
    const body = parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody) ? parsedBody : {}
    if (body.action === 'set') return handleSet(store, entries, session, body)
    if (body.action === 'merge') return handleMerge(store, entries, session, body)
    return jsonResponse({ error: 'Unsupported state action.' }, 400)
  }

  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST' })
}

export const config = {
  path: '/api/state',
}
