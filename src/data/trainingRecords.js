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
// Liz's note of 2026-10-10 gave two tiers — 12 hours for Program Directors and
// 6 for Program Staff — which left the fifteen Food Service Worker Leads and
// two Food Service Managers unnamed. She confirmed on 2026-10-11 that both
// take the middle tier at 10 hours, matching the USDA manager tier.
//
// The admin team (RDM, OM, FM, MM, HRM in her note) tracks its training
// separately and is deliberately not in this roster, so there is nothing to
// add for them here.
//
// `null` still means "no requirement has been set", and a position not listed
// at all resolves to null rather than defaulting to a tier. Every current
// position is covered, so that path only matters when a new job title appears
// — at which point it shows as unset rather than silently reporting someone
// as compliant against a number nobody chose.
export const POSITION_TRAINING_HOURS = {
  'Food Service Director': 12,
  'Food Service Manager': 10,
  'Food Service Worker Lead': 10,
  'Cook': 6,
  'Food Service Worker': 6,
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

export function formatTrainingHours(value) {
  const hours = Number(value) || 0
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(2).replace(/0$/, '')
}
