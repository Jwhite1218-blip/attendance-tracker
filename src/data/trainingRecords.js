// USDA Professional Standards training hours.
//
// From Liz's 2026-10-10 notes: "Need to be able to input Training Records and
// pull reports by school for training hours", with required hours restarting
// each school year.
//
// One record per training event, carrying the employees it covered — that is
// how the training actually happens (a safety brief covers a whole kitchen),
// and it means a single entry does not have to be repeated nineteen times.
// Hours are then counted per employee out of those records.
import { writeSharedStorage } from './sharedStore.js'

export const TRAINING_STORAGE_KEY = 'training-records-v1'

// The four USDA Professional Standards key areas. More than one can apply to
// a single training, which is why a record holds a list.
export const TRAINING_AREAS = [
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'operations', label: 'Operations' },
  { id: 'administration', label: 'Administration' },
  { id: 'communications', label: 'Communications & Marketing' },
]

// defaultHours pre-fills the form where the length is fixed by the format.
// Liz gave 15 minutes for a safety brief; the rest vary, so they start empty.
export const TRAINING_TYPES = [
  { id: 'safety-brief', label: 'Safety Brief', defaultHours: 0.25 },
  { id: 'on-the-job', label: 'On-the-Job', defaultHours: null },
  { id: 'staff-meeting', label: 'Staff Meeting/Huddle', defaultHours: null },
  { id: 'new-hire', label: 'New Hire/Orientation', defaultHours: null },
  { id: 'manager-meeting', label: 'Manager Meeting', defaultHours: null },
  { id: 'in-service', label: 'In-Service', defaultHours: null },
  { id: 'other', label: 'Other', defaultHours: null },
]

export const TRAINING_AREA_MAP = Object.fromEntries(TRAINING_AREAS.map(area => [area.id, area]))
export const TRAINING_TYPE_MAP = Object.fromEntries(TRAINING_TYPES.map(type => [type.id, type]))

// Quarter-hour increments, which is how Liz asked for them to be entered.
// Twelve hours is the largest requirement, so the list stops there.
export const TRAINING_HOUR_OPTIONS = Array.from({ length: 48 }, (_, index) => (index + 1) * 0.25)

// Annual requirement by roster position, restarting each July.
//
// Food service staff, confirmed by Liz 2026-10-11: 12 hours for the Director,
// 10 for Food Service Managers and Worker Leads, 6 for Cooks and Food Service
// Workers.
//
// Admin team, given 2026-10-11 and tracked here after all: RDM 12, RN 10,
// Chef 10, and 6 for the office roles (OM, FM, MM, HRM).
//
// The admin titles are recorded under the abbreviations Liz uses. None of them
// is in the roster yet — matching is on the exact `position` string, so if
// those people are added with the title spelled out ("Office Manager" rather
// than "OM") they will read as unset until the spelling here matches.
//
// `null` is not used any more, but a position absent from this table still
// resolves to null rather than defaulting to a tier. That is what stops a new
// job title from being silently reported as compliant against a number nobody
// chose.
export const POSITION_TRAINING_HOURS = {
  // Food service
  'Food Service Director': 12,
  'Food Service Manager': 10,
  'Food Service Worker Lead': 10,
  'Cook': 6,
  'Food Service Worker': 6,
  // Admin team. Both the abbreviation Liz writes and the spelled-out title,
  // because matching is on the exact roster string and nobody should have to
  // remember which spelling the tracker wants.
  'RDM': 12,
  'District Office Manager': 6,
  'RN': 10,
  'Chef': 10,
  'OM': 6,
  'FM': 6,
  'MM': 6,
  'HRM': 6,
}

export function requiredHoursFor(employee) {
  const position = String(employee?.position || '').trim()
  return Object.hasOwn(POSITION_TRAINING_HOURS, position)
    ? POSITION_TRAINING_HOURS[position]
    : null
}

// July–June, matching attendance and recognition. Duplicated locally rather
// than imported for the same reason hrFlags duplicates it: these modules must
// not depend on each other just to agree on a calendar.
export function trainingSchoolYearStart(dateValue = new Date()) {
  const date = dateValue instanceof Date
    ? dateValue
    : new Date(`${String(dateValue).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(date.valueOf())) throw new Error('A valid date is required.')
  return date.getMonth() >= 6 ? date.getFullYear() : date.getFullYear() - 1
}

export function isTrainingInSchoolYear(record, startYear) {
  if (startYear == null) return true
  const date = String(record?.date || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  return date >= `${startYear}-07-01` && date <= `${startYear + 1}-06-30`
}

function readTrainingMap() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TRAINING_STORAGE_KEY) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function getAllTrainingRecords() {
  return Object.values(readTrainingMap())
    .filter(record => record && typeof record === 'object' && record.id)
    .sort((left, right) => {
      const byDate = String(right.date || '').localeCompare(String(left.date || ''))
      return byDate || String(right.createdAt || '').localeCompare(String(left.createdAt || ''))
    })
}

export function createTrainingRecord(input, options = {}) {
  const title = String(input.title || '').trim().slice(0, 160)
  if (!title) throw new Error('A training title is required.')

  const date = String(input.date || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('A training date is required.')

  const hours = Number(input.hours)
  if (!Number.isFinite(hours) || hours <= 0) throw new Error('Choose how many hours the training earned.')
  // Quarter-hour increments only: anything else means the form was bypassed,
  // and a stray 0.37 would quietly skew a compliance total.
  if (Math.round(hours * 4) !== hours * 4) throw new Error('Hours must be in 15-minute increments.')
  if (hours > 12) throw new Error('A single training cannot exceed 12 hours.')

  const typeId = String(input.type || '').trim()
  if (!TRAINING_TYPE_MAP[typeId]) throw new Error('Choose a type of training.')

  const areas = [...new Set((Array.isArray(input.areas) ? input.areas : [])
    .map(area => String(area || '').trim())
    .filter(area => TRAINING_AREA_MAP[area]))]
  if (!areas.length) throw new Error('Choose at least one training area.')

  const employeeIds = [...new Set((Array.isArray(input.employeeIds) ? input.employeeIds : [])
    .map(id => String(id || '').trim())
    .filter(Boolean))]
  if (!employeeIds.length) throw new Error('Choose who attended the training.')

  return {
    id: options.id || `trn-${date}-${Math.random().toString(36).slice(2, 10)}`,
    title,
    date,
    hours,
    type: typeId,
    areas,
    trainer: String(input.trainer || '').trim().slice(0, 120),
    employeeIds,
    createdAt: options.createdAt || new Date().toISOString(),
    createdBy: String(options.createdBy || input.createdBy || '').trim().slice(0, 80),
  }
}

export function addTrainingRecord(input, options = {}) {
  const record = createTrainingRecord(input, options)
  const records = readTrainingMap()
  records[record.id] = record
  writeSharedStorage(TRAINING_STORAGE_KEY, records)
  return record
}

// Editing revalidates through createTrainingRecord rather than patching the
// stored object, so a correction cannot produce a record the form would have
// refused — half an hour, no areas, nobody attending. Identity and authorship
// are preserved; who changed it and when are added alongside, because these
// are compliance records and "it said six hours last week" is a question
// somebody will eventually ask.
export function updateTrainingRecord(recordId, input, options = {}) {
  const records = readTrainingMap()
  const existing = records[String(recordId)]
  if (!existing) throw new Error('That training record no longer exists.')

  const updated = createTrainingRecord(input, {
    id: existing.id,
    createdAt: existing.createdAt,
    createdBy: existing.createdBy,
  })
  updated.updatedAt = new Date().toISOString()
  updated.updatedBy = String(options.updatedBy || '').trim().slice(0, 80)

  records[existing.id] = updated
  writeSharedStorage(TRAINING_STORAGE_KEY, records)
  return updated
}

// Which way the attendee list was chosen, worked out from the list itself so
// reopening a record shows the same shape it was entered in. A record covering
// everyone reopens as "all employees" rather than as 146 individually ticked
// boxes — and, more usefully, a record covering whole buildings reopens with
// those buildings selected.
export function inferAttendeeScope(employeeIds, employees) {
  const selected = new Set((employeeIds || []).map(String))
  const roster = employees || []
  if (!roster.length || !selected.size) return { scope: 'people', schools: [] }

  const everyone = roster.every(employee => selected.has(String(employee.kronos_id || employee.id)))
  if (everyone && selected.size === roster.length) return { scope: 'all', schools: [] }

  const byLocation = new Map()
  for (const employee of roster) {
    const locationId = String(employee.location || '')
    if (!byLocation.has(locationId)) byLocation.set(locationId, [])
    byLocation.get(locationId).push(String(employee.kronos_id || employee.id))
  }

  const schools = []
  for (const [locationId, ids] of byLocation) {
    const picked = ids.filter(id => selected.has(id)).length
    // A partly-selected building means this was not a by-school choice.
    if (picked === 0) continue
    if (picked !== ids.length) return { scope: 'people', schools: [] }
    if (locationId) schools.push(locationId)
  }

  return schools.length ? { scope: 'schools', schools } : { scope: 'people', schools: [] }
}

export function removeTrainingRecord(recordId) {
  const records = readTrainingMap()
  if (!records[String(recordId)]) return false
  delete records[String(recordId)]
  writeSharedStorage(TRAINING_STORAGE_KEY, records)
  return true
}

export function trainingHoursFor(records, employeeId, startYear = null) {
  return (records || [])
    .filter(record => isTrainingInSchoolYear(record, startYear))
    .filter(record => (record.employeeIds || []).some(id => String(id) === String(employeeId)))
    .reduce((total, record) => total + (Number(record.hours) || 0), 0)
}

export function trainingRecordsFor(records, employeeId, startYear = null) {
  return (records || [])
    .filter(record => isTrainingInSchoolYear(record, startYear))
    .filter(record => (record.employeeIds || []).some(id => String(id) === String(employeeId)))
}

// One row per employee: what they need, what they have, and whether that is
// enough. `status` is 'met' | 'short' | 'unset' — 'unset' is a position with no
// requirement defined, which must not be reported as compliant.
export function trainingSummaryForEmployees(records, employees, startYear = null) {
  return (employees || []).map(employee => {
    const employeeId = String(employee.kronos_id || employee.id)
    const required = requiredHoursFor(employee)
    const earned = trainingHoursFor(records, employeeId, startYear)
    const status = required == null ? 'unset' : earned >= required ? 'met' : 'short'
    return {
      employee,
      employeeId,
      required,
      earned,
      remaining: required == null ? null : Math.max(0, Math.round((required - earned) * 100) / 100),
      status,
    }
  })
}

// "Pull reports by school for training hours" — the summary grouped by
// building, with the counts Liz needs to see at a glance.
export function trainingSummaryByLocation(records, employees, startYear = null) {
  const rows = trainingSummaryForEmployees(records, employees, startYear)
  const byLocation = new Map()

  for (const row of rows) {
    const locationId = String(row.employee.location || '').trim() || 'unassigned'
    if (!byLocation.has(locationId)) {
      byLocation.set(locationId, {
        locationId,
        rows: [],
        totalHours: 0,
        staffCount: 0,
        metCount: 0,
        shortCount: 0,
        unsetCount: 0,
      })
    }
    const group = byLocation.get(locationId)
    group.rows.push(row)
    group.staffCount += 1
    group.totalHours = Math.round((group.totalHours + row.earned) * 100) / 100
    if (row.status === 'met') group.metCount += 1
    else if (row.status === 'short') group.shortCount += 1
    else group.unsetCount += 1
  }

  return [...byLocation.values()]
    .map(group => ({
      ...group,
      rows: group.rows.sort((left, right) =>
        String(left.employee.last_name || '').localeCompare(String(right.employee.last_name || ''))),
    }))
    .sort((left, right) => left.locationId.localeCompare(right.locationId))
}

// ---------------------------------------------------------------------------
// The report Liz hands to the state.
//
// Three sheets, because three different questions get asked of this data:
// whether a building is covered, whether a named person is covered, and what
// was actually delivered. Pure row builders — SheetJS stays in the UI layer.

export function buildTrainingSummarySheet(groups, locationName = id => id) {
  return (groups || []).map(group => ({
    School: group.locationId === 'unassigned' ? 'No school assigned' : locationName(group.locationId),
    Staff: group.staffCount,
    'Hours recorded': group.totalHours,
    'Requirement met': group.metCount,
    'Still short': group.shortCount,
    'No requirement set': group.unsetCount,
  }))
}

export function buildTrainingEmployeeSheet(groups, locationName = id => id) {
  return (groups || []).flatMap(group => group.rows.map(row => ({
    School: group.locationId === 'unassigned' ? 'No school assigned' : locationName(group.locationId),
    'Last name': row.employee.last_name || '',
    'First name': row.employee.first_name || '',
    Position: row.employee.position || '',
    'Hours earned': row.earned,
    'Hours required': row.required == null ? '' : row.required,
    'Hours remaining': row.remaining == null ? '' : row.remaining,
    Status: row.status === 'met' ? 'Met' : row.status === 'short' ? 'Short' : 'No requirement set',
  })))
}

export function buildTrainingLogSheet(records, resolveName = id => id) {
  return (records || []).map(record => ({
    Date: record.date,
    Training: record.title,
    Hours: record.hours,
    Type: TRAINING_TYPE_MAP[record.type]?.label || record.type,
    Areas: (record.areas || []).map(area => TRAINING_AREA_MAP[area]?.label || area).join(', '),
    Trainer: record.trainer || '',
    Attended: (record.employeeIds || []).length,
    Employees: (record.employeeIds || []).map(resolveName).join('; '),
  }))
}

// A dated, labelled header so a printed or emailed copy says what it covers
// without anyone having to remember.
export function buildTrainingReportHeader(startYear, generatedAt = new Date()) {
  return [
    ['USDA Professional Standards — training hours'],
    [`School year ${startYear}-${startYear + 1} (1 July ${startYear} to 30 June ${startYear + 1})`],
    [`Generated ${generatedAt.toISOString().slice(0, 10)}`],
    [],
  ]
}

export function trainingReportFilename(startYear) {
  return `professional-standards-${startYear}-${startYear + 1}.xlsx`
}

export function formatTrainingHours(value) {
  const hours = Number(value) || 0
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(2).replace(/0$/, '')
}
