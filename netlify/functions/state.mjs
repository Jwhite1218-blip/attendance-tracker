import { randomUUID } from 'node:crypto'
import employees from '../../src/data/employees.json' with { type: 'json' }
import { CODE_MAP } from '../../src/data/attendanceCodes.js'
import { hasLizAdminAccess } from '../../src/data/futureTools.js'
import { DISTRICT_OFFICE_LOCATION, MANAGER_GRADE_POSITIONS } from '../../src/data/recognitionStore.js'
import { monthlyDrawingStatus, recognitionTypeAllowedForRole } from '../../src/data/recognitionRules.js'
import { applyStateMutation, createStateMutation } from '../../src/data/stateMutations.js'
import { jsonResponse } from './_shared/auth.mjs'
import { validatedSessionFromRequest } from './_shared/server-session.mjs'
import { PermanentStateError, getStateStore } from './_shared/state-store.mjs'
import {
  BLACKOUTS_KEY,
  CUSTOM_EMPLOYEES_KEY,
  EMPLOYEE_NOTES_KEY,
  HR_STATUS_KEY,
  LEGACY_HR_STATUS_KEY,
  PROGRAM_SETTINGS_KEY,
  LOCATION_OVERRIDES_KEY,
  RECOGNITION_KEY,
  RECORD_OVERRIDES_KEY,
  TRAINING_KEY,
  attendanceEmployeeId,
  canWriteStateKey,
  filterStatusesForEmployees,
  isManagedStateKey,
} from './_shared/permissions.mjs'

const META_KEY = '__state_meta__'
const PRE_RESTORE_BACKUP_KEY = '__state_backup_before_restore__'
const BACKUP_FORMAT = 'warren-attendance-backup'
const BACKUP_VERSION = 1
const BACKUP_MAX_BYTES = 25 * 1024 * 1024
const BACKUP_MAX_KEYS = 5000
const RESTORE_CONFIRMATION = 'RESTORE'

function employeeKey(employee) {
  return String(employee?.kronos_id || employee?.id || '')
}

function withoutLizOnlyEmployeeFields(employee) {
  if (!employee || typeof employee !== 'object' || Array.isArray(employee)) return employee
  // phone was collected for eight days in October 2026 and removed at HR's
  // request. Stripped here as well as from the screens, so a number entered
  // in that window stops being sent to a building at all. Stored values are
  // untouched and can be purged separately.
  const { t_shirt_size: _tShirtSize, phone: _phone, ...publicEmployeeFields } = employee
  return publicEmployeeFields
}

function redactRecordOverrides(records) {
  return Object.fromEntries(
    Object.entries(records || {}).map(([employeeId, record]) => [
      employeeId,
      withoutLizOnlyEmployeeFields(record),
    ])
  )
}

// Both kinds of employee leave the server through the same allowlist.
//
// Until 2026-10-27 somebody from the roster file went out through
// publicEmployee, which names the fields that may leave, while somebody
// added in the app went through a denylist that removed two. The two
// agreed, but only because the Add Employee form cannot collect a field
// the allowlist would have dropped — a coincidence, not a guarantee.
//
// The next field added to an employee card would have reached fifteen
// buildings from one source and not the other, and nothing on any screen
// would have shown the difference. Liz asked for this after being bitten
// by the same shape of gap twice in a week.
//
// Only reached for sessions below Liz's tier; she sees the stored record.
function redactCustomEmployees(records, session) {
  return (Array.isArray(records) ? records : [])
    .map(employee => publicEmployee(employee, session))
}

// Withholds whole areas from a session that may not see them.
//
// Liz, 2026-10-26. This is the half that matters: hiding a page in the
// browser hides nothing, because the state endpoint had already sent the
// records to it. Anybody with the login could read them straight out of the
// network tab. A capability that is not applied here is decoration.
function withholdHiddenAreas(entries, session) {
  const kept = {}
  const seesAttendance = session.canViewAttendance !== false
  const seesTraining = session.canViewTraining !== false
  const seesBlackouts = session.canViewBlackouts !== false

  for (const [key, value] of Object.entries(entries)) {
    // Every per-employee attendance year, plus the occurrence counts and the
    // manager notes that sit beside them.
    if (!seesAttendance && (
      attendanceEmployeeId(key)
      || key === HR_STATUS_KEY
      || key === LEGACY_HR_STATUS_KEY
      || key === EMPLOYEE_NOTES_KEY
    )) continue
    if (!seesTraining && key === TRAINING_KEY) continue
    if (!seesBlackouts && key === BLACKOUTS_KEY) continue
    kept[key] = value
  }
  return kept
}

function redactLizOnlyEmployeeEntries(entries, session) {
  const redacted = { ...entries }
  if (redacted[RECORD_OVERRIDES_KEY]) {
    redacted[RECORD_OVERRIDES_KEY] = redactRecordOverrides(redacted[RECORD_OVERRIDES_KEY])
  }
  if (Array.isArray(redacted[CUSTOM_EMPLOYEES_KEY])) {
    redacted[CUSTOM_EMPLOYEES_KEY] = redactCustomEmployees(redacted[CUSTOM_EMPLOYEES_KEY], session)
  }
  return redacted
}

function publicEmployee(employee, session) {
  const shared = {
    id: employee.id,
    kronos_id: employee.kronos_id,
    first_name: employee.first_name || '',
    last_name: employee.last_name || '',
    position: employee.position || '',
    location: employee.location || '',
  }

  // service_date drives years of service; birthdate drives the birthday
  // card. Both earn their place on a building's screen.
  //
  // hire_date used to be sent to Liz's tier alone. It is gone entirely as of
  // 2026-10-20: the only thing it fed was work anniversaries, the district's
  // own hire dates turned out to be unreliable, and an HR field kept for a
  // feature nobody trusts is a field kept for nothing.
  const milestones = {
    service_date: employee.service_date || '',
    birthdate: employee.birthdate || '',
  }

  if (session.recognitionOnly === true) return shared
  if (!hasLizAdminAccess(session)) return { ...shared, ...milestones }
  return {
    ...shared,
    ...milestones,
    t_shirt_size: employee.t_shirt_size || '',
  }
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

function createBackupPayload(entries, session, now = new Date()) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    exportedBy: String(session.displayName || 'Liz administrator').slice(0, 200),
    entries,
  }
}

function emptyManagedValue(key) {
  return key === BLACKOUTS_KEY || key === CUSTOM_EMPLOYEES_KEY ? [] : {}
}

function backupEntriesFromPayload(backup) {
  if (
    !backup
    || typeof backup !== 'object'
    || Array.isArray(backup)
    || backup.format !== BACKUP_FORMAT
    || backup.version !== BACKUP_VERSION
    || !backup.entries
    || typeof backup.entries !== 'object'
    || Array.isArray(backup.entries)
  ) {
    throw new Error('The selected file is not a supported Warren attendance backup.')
  }

  const serialized = JSON.stringify(backup)
  if (serialized.length > BACKUP_MAX_BYTES) throw new Error('The selected backup is too large.')

  const entries = backup.entries
  const keys = Object.keys(entries)
  if (keys.length > BACKUP_MAX_KEYS) throw new Error('The selected backup contains too many data sections.')
  for (const key of keys) {
    if (!isManagedStateKey(key)) throw new Error('The selected backup contains an unsupported data section.')
    const value = entries[key]
    const requiresArray = key === BLACKOUTS_KEY || key === CUSTOM_EMPLOYEES_KEY
    if (requiresArray ? !Array.isArray(value) : (!value || typeof value !== 'object' || Array.isArray(value))) {
      throw new Error('The selected backup contains an invalid data section.')
    }
  }
  return entries
}

async function loadSchoolRosterEntries(store) {
  const rows = await Promise.all(
    [LOCATION_OVERRIDES_KEY, RECORD_OVERRIDES_KEY, CUSTOM_EMPLOYEES_KEY]
      .map(async key => [key, await store.get(key, { type: 'json' })])
  )
  return Object.fromEntries(rows.filter(([, value]) => value !== null))
}

// Accepts one building or several. A multi-site manager's roster is the
// union of the kitchens they cover.
// Every building a school session covers. One for almost all of them.
function schoolLocationsOf(session) {
  return Array.isArray(session?.locationIds) && session.locationIds.length
    ? session.locationIds
    : [session?.locationId].filter(Boolean)
}

function allowedEmployeeIdsForSchool(entries, locations) {
  const allowed = new Set(
    (Array.isArray(locations) ? locations : [locations]).filter(Boolean).map(String)
  )
  return allowedEmployeeIdsForLocations(entries, allowed)
}

function allowedEmployeeIdsForLocations(entries, allowed) {
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
        return allowed.has(String(effectiveLocation))
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
  // Programme settings go to every session, including the narrowest ones.
  // They are district policy, not personal data, and a session that does not
  // receive them falls back to the shipped defaults — so a manager would see
  // different milestones and different occurrence colours from Liz, with
  // nothing on screen to say why.
  const programSettings = entries[PROGRAM_SETTINGS_KEY]
    ? { [PROGRAM_SETTINGS_KEY]: entries[PROGRAM_SETTINGS_KEY] }
    : {}

  if (session.recognitionOnly === true) {
    return {
      ...programSettings,
      ...(entries[RECOGNITION_KEY] ? { [RECOGNITION_KEY]: withoutRedrawHistory(entries[RECOGNITION_KEY]) } : {}),
    }
  }
  if (hasLizAdminAccess(session)) return redrawHistoryForSession(withholdHiddenAreas(entries, session), session)
  if (session.role === 'admin') {
    return redrawHistoryForSession(
      withholdHiddenAreas(redactLizOnlyEmployeeEntries(entries, session), session),
      session
    )
  }

  const allowedEmployeeIds = allowedEmployeeIdsForSchool(entries, schoolLocationsOf(session))
  const filtered = { ...programSettings }

  if (entries[BLACKOUTS_KEY]) filtered[BLACKOUTS_KEY] = entries[BLACKOUTS_KEY]
  if (entries[LOCATION_OVERRIDES_KEY]) {
    filtered[LOCATION_OVERRIDES_KEY] = filterRecordMap(entries[LOCATION_OVERRIDES_KEY], allowedEmployeeIds)
  }
  if (entries[RECORD_OVERRIDES_KEY]) {
    filtered[RECORD_OVERRIDES_KEY] = redactRecordOverrides(
      filterRecordMap(entries[RECORD_OVERRIDES_KEY], allowedEmployeeIds)
    )
  }
  // Own staff, plus anybody manager-grade — the same boundary
  // rosterForSession draws for the people who ship in the roster file.
  //
  // Liz, 2026-10-27: her District Admin page listed ten, and a kitchen
  // manager's Shout-Out list offered three of them. The three were the
  // ones in employees.json; the other seven had been added through the
  // app, and a custom record was only ever sent to the building its
  // employee worked in. So the district office was reachable or not
  // depending on which way that person had got into the system, which is
  // not a distinction anybody outside this file could have guessed.
  //
  // Same redaction as before, and attendance stays school-scoped: this
  // widens who a building can NAME, not what it can see about them.
  const managerGrade = managerGradeIds(entries)
  if (Array.isArray(entries[CUSTOM_EMPLOYEES_KEY])) {
    filtered[CUSTOM_EMPLOYEES_KEY] = redactCustomEmployees(
      entries[CUSTOM_EMPLOYEES_KEY]
        .filter(employee => {
          const key = employeeKey(employee)
          return allowedEmployeeIds.has(key) || managerGrade.has(key)
        }),
      session
    )
  }
  // Manager HR notes are district-administrator records. School sessions do
  // not receive them, even though their roster remains school-scoped.
  if (entries[HR_STATUS_KEY]) {
    filtered[HR_STATUS_KEY] = filterStatusesForEmployees(entries[HR_STATUS_KEY], allowedEmployeeIds)
  }
  if (entries[LEGACY_HR_STATUS_KEY]) {
    filtered[LEGACY_HR_STATUS_KEY] = filterStatusesForEmployees(entries[LEGACY_HR_STATUS_KEY], allowedEmployeeIds)
  }

  // School managers receive their own building's recognition board, plus
  // every Warren Star Shout-Out in the district. The same roster boundary is
  // applied again to writes in handleMutate — this widens what a building
  // can read, not what it can record.
  if (entries[RECOGNITION_KEY]) {
    filtered[RECOGNITION_KEY] = schoolRecognitionView(
      entries[RECOGNITION_KEY],
      allowedEmployeeIds,
      recipientNames(entries)
    )
  }

  Object.entries(entries).forEach(([key, value]) => {
    const attendanceId = attendanceEmployeeId(key)
    if (attendanceId && allowedEmployeeIds.has(String(attendanceId))) filtered[key] = value
  })

  return filtered
}

// Liz, 2026-10-26: "make the Warren Star Shout Outs visible across all
// feeds since they are able to do peer to peer recognitions."
//
// A shout-out is recorded against the building the recipient works in, so
// until now the Lowell manager who gave one to a Creston cook never saw it
// again. These are the one recognition that crosses buildings by design —
// anyone may give one, to anyone — so they now reach every session.
//
// Only this type. A Star of the Day, a nomination, a drawing and a Coach
// Buck all stay inside the building that owns them.
const CROSS_BUILDING_RECOGNITION_TYPES = new Set(['star-shout-out'])

// Names for people a session cannot otherwise see.
//
// The alternative was adding those employees to the roster the session
// receives, which would have put another building's staff into this
// manager's school picker, their employee cards and their attendance
// screens. A shout-out needs one thing to be readable — who it was for —
// so one thing is what travels.
function recipientNames(entries) {
  const names = new Map()
  const record = employee => {
    const key = employeeKey(employee)
    const name = `${employee?.first_name || ''} ${employee?.last_name || ''}`.trim()
    if (key && name) names.set(key, name)
  }
  employees.forEach(record)
  if (Array.isArray(entries?.[CUSTOM_EMPLOYEES_KEY])) entries[CUSTOM_EMPLOYEES_KEY].forEach(record)
  return names
}

// A redrawn month carries who was set aside (recognitionStore.js,
// replaceMonthlyWinner). Jon, 2026-10-30: that is for district
// administrators only. The people who run the drawing see it, in case the
// draw is ever questioned; a building, a recognition-only pilot and a
// read-only reviewer receive the winner and nothing about how the draw got
// there.
export function canSeeRedrawHistory(session) {
  return session?.role === 'admin'
    && session?.canEditRecognition === true
    && session?.recognitionOnly !== true
}

function recordWithoutRedraw(record) {
  if (!record || typeof record !== 'object' || !Object.hasOwn(record, 'redraw')) return record
  const { redraw: _redraw, ...rest } = record
  return rest
}

export function withoutRedrawHistory(recognitionMap) {
  return Object.fromEntries(
    Object.entries(recognitionMap || {}).map(([id, record]) => [id, recordWithoutRedraw(record)])
  )
}

function redrawHistoryForSession(entries, session) {
  if (!entries?.[RECOGNITION_KEY] || canSeeRedrawHistory(session)) return entries
  return { ...entries, [RECOGNITION_KEY]: withoutRedrawHistory(entries[RECOGNITION_KEY]) }
}

// The same bound the client keeps.
const MAX_SET_ASIDE = 50

function validRedrawHistory(redraw) {
  if (!redraw || typeof redraw !== 'object' || Array.isArray(redraw)) return false
  const setAside = redraw.setAside
  if (!Array.isArray(setAside) || setAside.length < 1 || setAside.length > MAX_SET_ASIDE) return false
  const validTime = value => typeof value === 'string' && !Number.isNaN(Date.parse(value))
  return setAside.every(entry => (
    entry
    && typeof entry === 'object'
    && !Array.isArray(entry)
    && typeof entry.employeeId === 'string'
    && entry.employeeId.trim().length > 0
    && entry.employeeId.length <= 200
    && (entry.drawnAt === undefined || validTime(entry.drawnAt))
    && validTime(entry.setAsideAt)
    && typeof entry.setAsideBy === 'string'
    && entry.setAsideBy.length <= 200
  ))
}

export function schoolRecognitionView(recognitionMap, allowedEmployeeIds, names = new Map()) {
  return Object.fromEntries(
    Object.entries(recognitionMap || {})
      .flatMap(([id, record]) => {
        const employeeId = String(record?.employeeId)
        if (allowedEmployeeIds.has(employeeId)) return [[id, recordWithoutRedraw(record)]]
        if (!CROSS_BUILDING_RECOGNITION_TYPES.has(String(record?.type))) return []
        // recipientName rather than a roster entry, so nothing downstream
        // mistakes this person for somebody the login manages.
        const name = names.get(employeeId)
        return [[id, name ? { ...record, recipientName: name } : record]]
      })
  )
}

function rosterForSession(entries, session) {
  if (session.role === 'admin') return employees.map(employee => publicEmployee(employee, session))

  // A building session sees its own staff, plus the manager pool from every
  // other building — and nothing else. Liz, 2026-10-19: Worker Leads and
  // Managers should be able to send each other a Warren Star Shout-Out, which
  // her own programme document already describes.
  //
  // This is the first time a school session receives anybody outside its own
  // roster, so the widening is kept as narrow as it can be: eighteen people,
  // through the same publicEmployee allowlist as everyone else, and only
  // because a Shout-Out is the one recognition that earns no star, feeds no
  // drawing and touches no discipline record.
  const allowedEmployeeIds = allowedEmployeeIdsForSchool(entries, schoolLocationsOf(session))
  const managerIds = managerGradeIds(entries)
  return employees
    .filter(employee => {
      const key = employeeKey(employee)
      return allowedEmployeeIds.has(key) || managerIds.has(key)
    })
    .map(employee => publicEmployee(employee, session))
}

function schoolStatusMutation(mutation, currentValue, allowedEmployeeIds) {
  if (mutation?.type !== 'object-patch') throw new Error('School status changes must be an object patch.')

  const set = Object.fromEntries(
    Object.entries(mutation.set || {}).filter(([, status]) =>
      allowedEmployeeIds.has(String(status?.empId))
    )
  )
  const remove = (Array.isArray(mutation.remove) ? mutation.remove : [])
    .map(String)
    .filter(statusKey => allowedEmployeeIds.has(String(currentValue?.[statusKey]?.empId)))
  return { type: 'object-patch', set, remove }
}

// Who may RECEIVE an ACE Coach Buck: kitchen managers, which is
// manager-grade minus the district office. Liz, 2026-10-19 — the programme
// is for the people running kitchens, not for the office that awards it.
// Read from the roster on the server, never trusted from the request.
function aceEligibleIds(entries) {
  return new Set(
    [...managerGradeIds(entries)].filter(id => {
      const employee = rosterEmployeeById(entries, id)
      return String(employee?.location || '').trim() !== DISTRICT_OFFICE_LOCATION
    })
  )
}

function rosterEmployeeById(entries, id) {
  const recordOverrides = entries?.[RECORD_OVERRIDES_KEY] || {}
  const customEmployees = Array.isArray(entries?.[CUSTOM_EMPLOYEES_KEY]) ? entries[CUSTOM_EMPLOYEES_KEY] : []
  const locationOverrides = entries?.[LOCATION_OVERRIDES_KEY] || {}
  const employee = [...employees, ...customEmployees].find(row => employeeKey(row) === String(id))
  if (!employee) return null
  const key = employeeKey(employee)
  return {
    ...employee,
    location: locationOverrides[key] || recordOverrides[key]?.location || employee.location,
  }
}

// Manager-grade personnel ids, read from the roster rather than trusted from
// the client. Used for the Shout-Out widening, which DOES include the
// district office — a Shout-Out may be sent to anybody manager-grade.
function managerGradeIds(entries) {
  const recordOverrides = entries?.[RECORD_OVERRIDES_KEY] || {}
  const locationOverrides = entries?.[LOCATION_OVERRIDES_KEY] || {}
  const customEmployees = Array.isArray(entries?.[CUSTOM_EMPLOYEES_KEY]) ? entries[CUSTOM_EMPLOYEES_KEY] : []
  return new Set(
    [...employees, ...customEmployees]
      .filter(employee => {
        const key = employeeKey(employee)
        // Effective location, not the one baked into the file: somebody
        // moved to or from the district office must be judged on where
        // they work now.
        const location = String(locationOverrides[key] || employee.location || '').trim()
        if (location === DISTRICT_OFFICE_LOCATION) return true
        const position = String(recordOverrides[key]?.position || employee.position || '').trim()
        return MANAGER_GRADE_POSITIONS.includes(position)
      })
      .map(employeeKey)
  )
}

function recognitionMutationForSession(mutation, session, allowedEmployeeIds, managerIds = null, aceIds = null) {
  if (mutation?.type !== 'object-patch') return mutation
  // A building manager may only recognise their own team. Rows naming anyone
  // else are dropped rather than rejected: the session's own roster is the
  // authority, not whatever employee id the client sent.
  const scopedToSchool = session.role === 'school'
  return {
    ...mutation,
    set: Object.fromEntries(
      Object.entries(mutation.set || {})
        .filter(([, recognition]) => {
          // An ACE Star Buck is a district award for manager-grade staff.
          // Both halves are enforced here because the page is not the thing
          // that has to hold: a school session must not award one at all,
          // and nobody may award one to somebody outside the manager pool.
          if (recognition?.type === 'ace-buck') {
            if (session.role !== 'admin') return false
            if (aceIds && !aceIds.has(String(recognition?.employeeId))) return false
            return true
          }
          // Peer recognition between buildings, and only this one type.
          // A Shout-Out earns nothing and decides nothing, which is what
          // makes it safe to let out of a building; a Daily Star would have
          // fed another school's monthly drawing.
          if (recognition?.type === 'star-shout-out' && managerIds?.has(String(recognition?.employeeId))) {
            return true
          }
          return !scopedToSchool || allowedEmployeeIds.has(String(recognition?.employeeId))
        })
        .map(([recognitionId, recognition]) => [
          recognitionId,
          {
            // Only the administrators who can see a redraw's history may
            // write one, so nobody else can plant or rewrite who was set
            // aside.
            ...(canSeeRedrawHistory(session) ? recognition : recordWithoutRedraw(recognition)),
            recognizedBy: String(session.displayName || 'Authenticated manager').slice(0, 200),
            // Stamped from the session, never from the client: this is what lets
            // the district see which building handed out each star.
            //
            // A manager covering several kitchens is credited to the kitchen
            // the recognised person works in, which is where they were
            // standing when they gave it. For everyone else that is their one
            // building, so nothing changes.
            recognizedByLocationId: String(
              (schoolLocationsOf(session).length > 1 && recognition?.locationId)
              || session.locationId
              || 'district'
            ).slice(0, 100),
          },
        ])
    ),
  }
}

function isSameOriginRequest(request) {
  const origin = request.headers.get('origin')
  return !origin || origin === new URL(request.url).origin
}

function validateMutation(key, mutation, { allowEmployeeNoteRemovals = false } = {}) {
  applyStateMutation(key, null, mutation)
  if (key === EMPLOYEE_NOTES_KEY) {
    if (mutation.type !== 'object-patch' || (!allowEmployeeNoteRemovals && (mutation.remove || []).length > 0)) {
      throw new Error('Employee note changes must be an object patch without deletions.')
    }
    for (const [employeeId, entries] of Object.entries(mutation.set || {})) {
      if (!employeeId || employeeId.length > 200 || !Array.isArray(entries)) {
        throw new Error('Employee note changes contain an invalid entry.')
      }
      for (const entry of entries) {
        const validText = entry && typeof entry.text === 'string' && entry.text.length > 0 && entry.text.length <= 4000
        const validAuthor = typeof entry?.author === 'string' && entry.author.length <= 200
        const validAt = entry?.at === null || (typeof entry?.at === 'string' && !Number.isNaN(Date.parse(entry.at)))
        if (!validText || !validAuthor || !validAt) {
          throw new Error('Employee note changes contain an invalid entry.')
        }
      }
    }
    return
  }
  if (key === RECOGNITION_KEY) {
    if (mutation.type !== 'object-patch') throw new Error('Recognition changes must be an object patch.')
    const validTypes = new Set([
      'star-of-day',
      'shooting-star',
      'star-shout-out',
      'warren-employee-month',
      'all-star-of-month',
      'ace-buck',
    ])
    const validDate = dateKey => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) return false
      const date = new Date(`${dateKey}T00:00:00Z`)
      return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === dateKey
    }

    for (const [recognitionId, recognition] of Object.entries(mutation.set || {})) {
      if (!recognitionId || recognitionId.length > 200 || recognition?.id !== recognitionId) {
        throw new Error('Recognition changes contain an invalid identity.')
      }
      if (
        !recognition
        || typeof recognition !== 'object'
        || Array.isArray(recognition)
        || !validTypes.has(recognition.type)
        || !validDate(recognition.date)
        || !String(recognition.employeeId || '').trim()
        || String(recognition.employeeId).length > 200
        || !String(recognition.locationId || '').trim()
        || String(recognition.locationId).length > 200
      ) {
        throw new Error('Recognition changes contain an invalid record.')
      }
      if (
        !Array.isArray(recognition.criteria)
        || recognition.criteria.length > 12
        || recognition.criteria.some(value => typeof value !== 'string' || value.length > 300)
      ) {
        throw new Error('Recognition changes contain invalid criteria.')
      }
      if (
        typeof recognition.note !== 'string'
        || recognition.note.length > 1000
        || typeof recognition.sourceName !== 'string'
        || recognition.sourceName.length > 200
        || typeof recognition.recognizedBy !== 'string'
        || recognition.recognizedBy.length > 200
        // Optional so records written before submitter attribution stay valid.
        || (recognition.recognizedByLocationId !== undefined
          && (typeof recognition.recognizedByLocationId !== 'string'
            || recognition.recognizedByLocationId.length > 100))
        // Present only on a record that has been corrected since.
        || (recognition.updatedAt !== undefined
          && (typeof recognition.updatedAt !== 'string' || Number.isNaN(Date.parse(recognition.updatedAt))))
        || (recognition.updatedBy !== undefined
          && (typeof recognition.updatedBy !== 'string' || recognition.updatedBy.length > 200))
        || typeof recognition.createdAt !== 'string'
        || Number.isNaN(Date.parse(recognition.createdAt))
      ) {
        throw new Error('Recognition changes contain invalid supporting details.')
      }
      if (recognition.type === 'all-star-of-month') {
        if (!/^\d{4}-\d{2}$/.test(String(recognition.monthKey || ''))) {
          throw new Error('Monthly All-Star changes require a valid month.')
        }
        if (!monthlyDrawingStatus(recognition.monthKey).isOpen) {
          throw new Error('The monthly drawing is not open yet.')
        }
        if (recognition.redraw !== undefined && !validRedrawHistory(recognition.redraw)) {
          throw new Error('Monthly All-Star changes contain an invalid redraw history.')
        }
      } else if (recognition.monthKey !== null) {
        throw new Error('Only monthly All-Star records may contain a drawing month.')
      } else if (recognition.redraw !== undefined) {
        throw new Error('Only monthly All-Star records may carry a redraw history.')
      }
    }
    if ((mutation.remove || []).some(value => !String(value || '').trim() || String(value).length > 200)) {
      throw new Error('Recognition changes contain an invalid removal identity.')
    }
    return
  }
  if (!attendanceEmployeeId(key)) return
  if (mutation.type !== 'object-patch') throw new Error('Attendance changes must be an object patch.')

  const expectedYear = key.match(/-([0-9]{4})$/)?.[1]
  const validDate = dateKey => {
    if (!new RegExp(`^${expectedYear}-[0-9]{2}-[0-9]{2}$`).test(String(dateKey))) return false
    const date = new Date(`${dateKey}T00:00:00Z`)
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === dateKey
  }

  for (const [dateKey, record] of Object.entries(mutation.set || {})) {
    if (!validDate(dateKey) || !record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error('Attendance patch contains an invalid record.')
    }
    if (!CODE_MAP[String(record.code || '')] || record.date !== dateKey) {
      throw new Error('Attendance patch contains an invalid code or date.')
    }
    if (record.note !== undefined && (typeof record.note !== 'string' || record.note.length > 2000)) {
      throw new Error('Attendance comments cannot exceed 2,000 characters.')
    }
  }
  if (!(mutation.remove || []).every(validDate)) {
    throw new Error('Attendance patch contains an invalid removal date.')
  }
}

export async function handleBackupRestore(store, session, body) {
  if (!hasLizAdminAccess(session)) {
    return jsonResponse({ error: 'Only Liz administrator access can restore a full backup.' }, 403)
  }
  if (String(body.confirmation || '') !== RESTORE_CONFIRMATION) {
    return jsonResponse({ error: 'Type RESTORE to confirm the recovery operation.' }, 400)
  }

  let backupEntries
  let currentEntries
  let targetEntries
  try {
    backupEntries = backupEntriesFromPayload(body.backup)
    currentEntries = await loadEntries(store)
    const keys = new Set([...Object.keys(currentEntries), ...Object.keys(backupEntries)])
    targetEntries = Object.fromEntries([...keys].map(key => [
      key,
      Object.hasOwn(backupEntries, key) ? backupEntries[key] : emptyManagedValue(key),
    ]))

    for (const [key, value] of Object.entries(targetEntries)) {
      const mutation = createStateMutation(key, currentEntries[key] ?? null, value)
      validateMutation(key, mutation, { allowEmployeeNoteRemovals: true })
    }
  } catch (error) {
    return jsonResponse({ error: error.message || 'The selected backup is invalid.' }, 400)
  }

  const actor = String(session.displayName || 'Liz administrator').slice(0, 200)
  await store.setJSON(PRE_RESTORE_BACKUP_KEY, createBackupPayload(currentEntries, session), actor)

  const writtenKeys = []
  try {
    for (const [key, value] of Object.entries(targetEntries)) {
      await store.setJSON(key, value, actor)
      writtenKeys.push(key)
    }
  } catch (error) {
    await Promise.allSettled(writtenKeys.map(key => (
      store.setJSON(key, currentEntries[key] ?? emptyManagedValue(key), `${actor} automatic rollback`)
    )))
    throw error
  }

  return jsonResponse({
    ok: true,
    restoredAt: new Date().toISOString(),
    restoredSections: Object.keys(targetEntries).length,
  })
}

export async function handleMutate(store, session, body) {
  const key = String(body.key || '')
  const rosterEntries = session.role === 'school' ? await loadSchoolRosterEntries(store) : {}
  const allowedEmployeeIds = session.role === 'school'
    ? allowedEmployeeIdsForSchool(rosterEntries, schoolLocationsOf(session))
    : new Set()

  if (!isManagedStateKey(key) || !canWriteStateKey(session, key, allowedEmployeeIds)) {
    return jsonResponse({ error: 'You do not have permission to make that change.' }, 403)
  }
  if ((key === RECORD_OVERRIDES_KEY || key === CUSTOM_EMPLOYEES_KEY) && !hasLizAdminAccess(session)) {
    return jsonResponse({ error: 'Only Liz administrator access can change employee-card details.' }, 403)
  }

  let mutation = body.mutation
  // Loaded once and used twice: by the write rules below, and by the reply
  // filter at the end, which needs the custom employees to name a
  // shout-out recipient outside this building.
  let rosterForRules = null
  if (
    key === RECOGNITION_KEY
    && mutation?.type === 'object-patch'
    && Object.values(mutation.set || {}).some(recognition => (
      !recognitionTypeAllowedForRole(
        session.role,
        recognition?.type,
        session.canManageRecognitionAwards !== false && session.recognitionOnly !== true
      )
    ))
  ) {
    return jsonResponse({ error: 'Only a district administrator can record Warren Food Services Employee of the Month.' }, 403)
  }
  if (key === RECOGNITION_KEY) {
    rosterForRules = await loadSchoolRosterEntries(store)
    mutation = recognitionMutationForSession(
      mutation,
      session,
      allowedEmployeeIds,
      managerGradeIds(rosterForRules),
      aceEligibleIds(rosterForRules)
    )
  }
  try {
    validateMutation(key, mutation)
  } catch {
    return jsonResponse({ error: 'The requested state change is invalid.' }, 400)
  }

  if (session.role === 'school' && (key === HR_STATUS_KEY || key === LEGACY_HR_STATUS_KEY)) {
    const currentValue = await store.get(key, { type: 'json' })
    mutation = schoolStatusMutation(mutation, currentValue, allowedEmployeeIds)
  }

  const value = await store.updateJSON(key, mutation, session.displayName || 'authenticated user')
  let publicValue = session.role === 'school' && (key === HR_STATUS_KEY || key === LEGACY_HR_STATUS_KEY)
    ? filterStatusesForEmployees(value, allowedEmployeeIds)
    : value
  // A write returns the whole key, and the whole recognition key is the
  // whole district. Until now a manager recording one star got back every
  // recognition in Warren — the GET was filtered and the write reply was
  // not. Filtered through the same function, so the two cannot disagree
  // about what a building may read.
  if (session.role === 'school' && key === RECOGNITION_KEY) {
    publicValue = schoolRecognitionView(
      value,
      allowedEmployeeIds,
      recipientNames(rosterForRules || {})
    )
  } else if (key === RECOGNITION_KEY && !canSeeRedrawHistory(session)) {
    publicValue = withoutRedrawHistory(value)
  }
  if (!hasLizAdminAccess(session) && key === RECORD_OVERRIDES_KEY) {
    publicValue = redactRecordOverrides(publicValue)
  }
  if (!hasLizAdminAccess(session) && key === CUSTOM_EMPLOYEES_KEY) {
    publicValue = redactCustomEmployees(publicValue, session)
  }
  return jsonResponse({ ok: true, value: publicValue })
}

export async function handleStateRequest(request, { stateStore, sessionStore } = {}) {
  const session = await validatedSessionFromRequest(request, Date.now(), sessionStore)
  if (!session) return jsonResponse({ error: 'Authentication required.' }, 401)

  const store = stateStore || getStateStore()
  if (request.method === 'GET') {
    const [entries, meta] = await Promise.all([
      loadEntries(store),
      store.get(META_KEY, { type: 'json' }),
    ])
    if (new URL(request.url).searchParams.get('action') === 'backup') {
      if (!hasLizAdminAccess(session)) {
        return jsonResponse({ error: 'Only Liz administrator access can download a full backup.' }, 403)
      }
      const dateKey = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      return jsonResponse(createBackupPayload(entries, session), 200, {
        'Content-Disposition': `attachment; filename="warren-attendance-backup-${dateKey}.json"`,
      })
    }
    return jsonResponse({
      initialized: Boolean(meta),
      entries: filterEntriesForSession(entries, session),
      roster: rosterForSession(entries, session),
    })
  }

  if (request.method === 'POST') {
    if (!isSameOriginRequest(request)) return jsonResponse({ error: 'Cross-origin state changes are not allowed.' }, 403)
    const parsedBody = await request.json().catch(() => null)
    const body = parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody) ? parsedBody : {}
    if (body.action === 'mutate') return handleMutate(store, session, body)
    if (body.action === 'restore-backup') return handleBackupRestore(store, session, body)
    return jsonResponse({ error: 'Unsupported state action.' }, 400)
  }

  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST' })
}

export default async (request, context) => {
  const startedAt = Date.now()
  const requestId = context?.requestId || randomUUID()
  let response
  try {
    response = await handleStateRequest(request)
  } catch (error) {
    console.error(JSON.stringify({ event: 'state-error', requestId, message: error.message }))
    // 503 means "come back later" and the client retries forever on it. A
    // write the database will never accept has to say so, or one rejected
    // key blocks every later write in the queue and takes sign-in with it.
    response = error instanceof PermanentStateError
      ? jsonResponse({
        error: 'That change was refused and cannot be retried. It has been set aside.',
        permanent: true,
        requestId,
      }, 422)
      : jsonResponse({ error: 'The shared attendance service is temporarily unavailable.', requestId }, 503)
  }
  response.headers.set('X-Request-ID', requestId)
  console.log(JSON.stringify({
    event: 'state-request',
    requestId,
    method: request.method,
    status: response.status,
    durationMs: Date.now() - startedAt,
  }))
  return response
}

export const config = {
  path: '/api/state',
}
