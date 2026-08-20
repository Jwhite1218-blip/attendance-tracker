// Attendance accountability follows a July–June school year.
// The third qualifying occurrence starts formal tracking, the fourth triggers
// a verbal-warning stage, and two consecutive UNEX workdays reset union
// seniority status.

import { normalizeAttendanceCode } from './attendanceCodes.js'
import { writeSharedStorage } from './sharedStore.js'

const FLAGS_KEY = 'hr-attendance-progress-v2'
const LEGACY_FLAGS_KEY = 'hr-flags'
const TRACKING_THRESHOLD = 3
const VERBAL_WARNING_THRESHOLD = 4
const QUALIFYING_CODES = new Set(['UNEX', 'LI', 'EO', 'NCNS', 'CC', 'LE', 'L/EQ'])

export function isQualifyingCode(code) {
  return QUALIFYING_CODES.has(normalizeAttendanceCode(code))
}

function statusKey(empId, schoolYearStart) {
  return `${empId}-${schoolYearStart}`
}

function stageForCount(count) {
  if (count >= VERBAL_WARNING_THRESHOLD) return 'verbal_warning'
  if (count >= TRACKING_THRESHOLD) return 'formal_tracking'
  return 'documented'
}

function nextWorkday(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`)
  do {
    date.setDate(date.getDate() + 1)
  } while (date.getDay() === 0 || date.getDay() === 6)
  return date.toISOString().slice(0, 10)
}

function findSeniorityResetDate(triggers) {
  const callIns = triggers.filter(trigger => trigger.code === 'UNEX' || trigger.code === 'CC')
  for (let index = 0; index < callIns.length; index++) {
    if (callIns[index].code === 'CC') return callIns[index].date
    if (index > 0 && nextWorkday(callIns[index - 1].date) === callIns[index].date) {
      return callIns[index].date
    }
  }
  return null
}

function migrateLegacyFlags() {
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_FLAGS_KEY) || '{}')
    return Object.fromEntries(
      Object.values(legacy).map(flag => {
        const triggers = (flag.triggers || []).map(trigger => ({
          ...trigger,
          code: normalizeAttendanceCode(trigger.code),
        }))
        const year = Number(flag.year) || new Date(flag.flaggedAt || Date.now()).getFullYear()
        return [statusKey(flag.empId, year), {
          empId: flag.empId,
          schoolYearStart: year,
          occurrenceCount: triggers.length,
          stage: stageForCount(triggers.length),
          updatedAt: flag.flaggedAt || new Date().toISOString(),
          triggers,
          seniorityReset: Boolean(flag.seniorityReset || findSeniorityResetDate(triggers)),
          seniorityResetAt: flag.seniorityResetAt || findSeniorityResetDate(triggers),
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
    if (saved) return JSON.parse(saved)
    const migrated = migrateLegacyFlags()
    if (Object.keys(migrated).length) saveAllStatuses(migrated)
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
    .filter(record => isQualifyingCode(record.code))
    .map(record => ({ date: record.date, code: normalizeAttendanceCode(record.code) }))
    .sort((a, b) => a.date.localeCompare(b.date))

  if (!triggers.length) {
    delete statuses[key]
    saveAllStatuses(statuses)
    return
  }

  statuses[key] = {
    empId,
    schoolYearStart,
    occurrenceCount: triggers.length,
    stage: stageForCount(triggers.length),
    updatedAt: new Date().toISOString(),
    triggers,
    seniorityReset: Boolean(findSeniorityResetDate(triggers)),
    seniorityResetAt: findSeniorityResetDate(triggers),
  }
  saveAllStatuses(statuses)
}

export function getEmployeeAttendanceStatus(empId) {
  return Object.values(getAllStatuses())
    .filter(status => String(status.empId) === String(empId))
    .sort((a, b) => b.schoolYearStart - a.schoolYearStart)[0] || null
}

export function isFlagged(empId) {
  const status = getEmployeeAttendanceStatus(empId)
  return !!status && (status.occurrenceCount >= TRACKING_THRESHOLD || status.seniorityReset)
}

export function getAllFlaggedEmployees() {
  return Object.values(getAllStatuses())
    .filter(status => status.occurrenceCount >= TRACKING_THRESHOLD || status.seniorityReset)
    .sort((a, b) => {
      if (a.seniorityReset !== b.seniorityReset) return a.seniorityReset ? -1 : 1
      return new Date(b.updatedAt) - new Date(a.updatedAt)
    })
}

export function getAttendanceStageLabel(status) {
  if (!status) return 'No active attendance action'
  if (status.seniorityReset && status.stage === 'verbal_warning') return 'Union seniority reset · Verbal warning required'
  if (status.seniorityReset) return 'Union seniority reset'
  if (status.stage === 'verbal_warning') return 'Verbal warning required'
  if (status.stage === 'formal_tracking') return 'Formal attendance tracking'
  return `${status.occurrenceCount} documented occurrence${status.occurrenceCount === 1 ? '' : 's'}`
}
