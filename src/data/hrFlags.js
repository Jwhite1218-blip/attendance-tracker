// Attendance accountability follows a July–June school year.
// The third qualifying occurrence starts formal tracking, the fourth triggers
// a verbal-warning stage, and two consecutive NCNS workdays reset union
// seniority status.

import { normalizeAttendanceCode } from './attendanceCodes.js'
import { getDateAvailability } from './blackoutDates.js'
import { writeSharedStorage } from './sharedStore.js'
import { DEFAULT_OCCURRENCE_THRESHOLDS } from './programDefaults.js'
import { occurrenceThresholds } from './programSettings.js'

const FLAGS_KEY = 'hr-attendance-progress-v2'
const LEGACY_FLAGS_KEY = 'hr-flags'
// Shipped positions. What is in force comes from occurrenceThresholds(),
// which Liz can change in Settings and which falls back to exactly these.
const TRACKING_THRESHOLD = DEFAULT_OCCURRENCE_THRESHOLDS.tracking
const VERBAL_WARNING_THRESHOLD = DEFAULT_OCCURRENCE_THRESHOLDS.verbalWarning
const QUALIFYING_CODES = new Set(['UNEX', 'LI', 'EO', 'NCNS', 'CC', 'LE', 'L/EQ'])

export function isQualifyingCode(code) {
  return QUALIFYING_CODES.has(normalizeAttendanceCode(code))
}

function statusKey(empId, schoolYearStart) {
  return `${empId}-${schoolYearStart}`
}

// Matches attendanceStore.js's schoolYearStartOf, computed from "now" instead of a date key.
// Duplicated locally (rather than imported) because attendanceStore.js imports checkAndFlag
// from this module — importing back would create a circular dependency.
function currentSchoolYearStart() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  return month >= 7 ? year : year - 1
}

function stageForCount(count) {
  const { tracking, verbalWarning } = occurrenceThresholds()
  if (count >= verbalWarning) return 'verbal_warning'
  if (count >= tracking) return 'formal_tracking'
  return 'documented'
}

function nextScheduledWorkday(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`)
  do {
    date.setDate(date.getDate() + 1)
  } while (getDateAvailability(date.toISOString().slice(0, 10)).unavailable)
  return date.toISOString().slice(0, 10)
}

// Per Liz (2026-09-01): only back-to-back no-call/no-shows reset seniority. An
// unexcused call-in is still an occurrence and still counts toward the tracking
// and verbal-warning stages, but the employee did call, so it never reaches here.
function findSeniorityResetDate(triggers) {
  const noCallNoShows = (triggers || []).filter(trigger => trigger.code === 'NCNS')
  for (let index = 1; index < noCallNoShows.length; index++) {
    if (nextScheduledWorkday(noCallNoShows[index - 1].date) === noCallNoShows[index].date) {
      return noCallNoShows[index].date
    }
  }
  return null
}

// seniorityReset is recomputed from the stored triggers on every read rather
// than trusted as saved. Statuses written under the old consecutive-UNEX rule
// still carry its verdict, and this heals them in place on first read: the
// storage key is mirrored in the server allowlist and two SQL migrations, so
// bumping it would make this a schema change instead of a code fix.
function withDerivedSeniorityReset(statuses) {
  return Object.fromEntries(
    Object.entries(statuses || {}).map(([key, status]) => {
      const seniorityResetAt = findSeniorityResetDate(status?.triggers)
      return [key, { ...status, seniorityReset: Boolean(seniorityResetAt), seniorityResetAt }]
    })
  )
}

function migrateLegacyFlags() {
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_FLAGS_KEY) || '{}')
    return Object.fromEntries(
      Object.values(legacy).map(flag => {
        const triggers = (flag.triggers || []).map(trigger => ({
          ...trigger,
          code: normalizeAttendanceCode(trigger.code),
        })).filter(trigger => !getDateAvailability(trigger.date).unavailable)
        const year = Number(flag.year) || new Date(flag.flaggedAt || Date.now()).getFullYear()
        const seniorityResetAt = findSeniorityResetDate(triggers)
        return [statusKey(flag.empId, year), {
          empId: flag.empId,
          schoolYearStart: year,
          occurrenceCount: triggers.length,
          stage: stageForCount(triggers.length),
          updatedAt: flag.flaggedAt || new Date().toISOString(),
          triggers,
          seniorityReset: Boolean(seniorityResetAt),
          seniorityResetAt,
        }]
      })
    )
  } catch {
    return {}
  }
}

function getAllStatuses() {
  try {
    const saved = localStorage.getItem(FLAGS_KEY)
    if (saved) return withDerivedSeniorityReset(JSON.parse(saved))
    const migrated = migrateLegacyFlags()
    if (Object.keys(migrated).length) {
      try {
        saveAllStatuses(migrated)
      } catch {
        // Read-only sessions may display legacy status data without migrating it.
      }
    }
    return migrated
  } catch {
    return {}
  }
}

function saveAllStatuses(statuses) {
  writeSharedStorage(FLAGS_KEY, statuses)
}

export function checkAndFlag(empId, schoolYearStart, schoolYearData) {
  const statuses = getAllStatuses()
  const key = statusKey(empId, schoolYearStart)
  const triggers = Object.values(schoolYearData)
    .filter(record => isQualifyingCode(record.code) && !getDateAvailability(record.date).unavailable)
    .map(record => ({ date: record.date, code: normalizeAttendanceCode(record.code) }))
    .sort((a, b) => a.date.localeCompare(b.date))

  if (!triggers.length) {
    delete statuses[key]
    saveAllStatuses(statuses)
    return
  }

  const seniorityResetAt = findSeniorityResetDate(triggers)
  statuses[key] = {
    empId,
    schoolYearStart,
    occurrenceCount: triggers.length,
    stage: stageForCount(triggers.length),
    updatedAt: new Date().toISOString(),
    triggers,
    seniorityReset: Boolean(seniorityResetAt),
    seniorityResetAt,
  }
  saveAllStatuses(statuses)
}

// Only the current school year counts as an active status — the policy is a rolling one-year
// period, so a stage from a prior year shouldn't keep showing as in-effect once a new school
// year starts, even before that employee's first exception of the new year creates a fresh record.
export function getEmployeeAttendanceStatus(empId) {
  const currentYear = currentSchoolYearStart()
  return Object.values(getAllStatuses())
    .find(status => String(status.empId) === String(empId) && status.schoolYearStart === currentYear) || null
}

// Liz, 2026-10-10: the third occurrence turns the name yellow wherever the
// employee appears, but it stays off the district main page. Only the fourth —
// the point where a verbal warning has to be given — is escalated to the front
// page in red. A seniority reset is red immediately whatever the count, because
// two back-to-back no-call/no-shows is already a union matter.
//
//   'none'     — not being tracked
//   'tracking' — 3rd occurrence. Yellow name, building view only.
//   'action'   — 4th occurrence or a seniority reset. Red, and on the main page.
// Liz, 2026-10-11: the two were too close to tell apart on the attendance
// screens. amber-600 against red-600 is only a 1.52 contrast ratio with each
// other — adjacent hues at nearly the same darkness, which is the worst case
// for red-green colour blindness, where they become almost the same colour.
//
// Gold against deep crimson instead: they now differ in darkness as well as
// hue (ratio 2.00, and a doubled separation under a deuteranopia simulation),
// so the difference survives both a glance across a kitchen and a printout.
// Both still clear AA on white — 5.0 and 10.0 — which rules out the lighter
// ambers that would have separated better but been hard to read.
//
// The chips carry the same split, with the serious one filled more strongly
// so the two differ in weight and not only in colour.
export const ATTENDANCE_SEVERITY_CLASS = {
  none: 'text-gray-900',
  tracking: 'text-amber-700',
  action: 'text-red-900',
}

export const ATTENDANCE_SEVERITY_CHIP = {
  none: 'bg-gray-100 text-gray-600',
  tracking: 'bg-amber-50 text-amber-800',
  action: 'bg-red-100 text-red-900',
}

export function attendanceSeverityOf(status) {
  if (!status) return 'none'
  if (status.seniorityReset) return 'action'
  const { tracking, verbalWarning } = occurrenceThresholds()
  if (status.occurrenceCount >= verbalWarning) return 'action'
  if (status.occurrenceCount >= tracking) return 'tracking'
  return 'none'
}

export function attendanceSeverity(empId) {
  return attendanceSeverityOf(getEmployeeAttendanceStatus(empId))
}

// The district main page carries only what needs acting on today. The building
// view keeps the full watch list, so a third occurrence is still visible to the
// manager who can do something about it.
export function mainPageFlagged(flaggedWithEmployees) {
  return (flaggedWithEmployees || []).filter(entry => attendanceSeverityOf(entry) === 'action')
}

export function isFlagged(empId) {
  const status = getEmployeeAttendanceStatus(empId)
  return !!status && (status.occurrenceCount >= occurrenceThresholds().tracking || status.seniorityReset)
}

export function getAllFlaggedEmployees() {
  const currentYear = currentSchoolYearStart()
  return Object.values(getAllStatuses())
    .filter(status => status.schoolYearStart === currentYear && (status.occurrenceCount >= occurrenceThresholds().tracking || status.seniorityReset))
    .sort((a, b) => {
      if (a.seniorityReset !== b.seniorityReset) return a.seniorityReset ? -1 : 1
      return new Date(b.updatedAt) - new Date(a.updatedAt)
    })
}

// The follow-up list is a watch list: it only means something if every name on
// it is someone a manager can still act on. Employees who have left keep their
// flag (the history stays intact and comes back if they are reactivated) but
// move out of the main list into the inactive roster.
export function splitFlaggedByEmploymentStatus(flaggedWithEmployees) {
  const active = []
  const inactive = []
  ;(flaggedWithEmployees || []).forEach(entry => {
    if (entry?.employee?.active === false) inactive.push(entry)
    else active.push(entry)
  })
  return { active, inactive }
}

export function getAttendanceStageLabel(status) {
  if (!status) return 'No active attendance action'
  if (status.seniorityReset && status.stage === 'verbal_warning') return 'Union seniority reset · Verbal warning required'
  if (status.seniorityReset) return 'Union seniority reset'
  if (status.stage === 'verbal_warning') return 'Verbal warning required'
  if (status.stage === 'formal_tracking') return 'Formal attendance tracking'
  return `${status.occurrenceCount} documented occurrence${status.occurrenceCount === 1 ? '' : 's'}`
}
