// Single source of truth for attendance records.
// Storage remains browser-local for this first phase; every marking view uses
// this module so status and comments stay consistent across the app.

import { normalizeAttendanceCode } from './attendanceCodes.js'
import { checkAndFlag } from './hrFlags.js'

function storageKey(empId, year) {
  return `att-emp-${empId}-${year}`
}

function calendarYearOf(dateKey) {
  return Number(dateKey.slice(0, 4))
}

export function schoolYearStartOf(dateKey) {
  const year = calendarYearOf(dateKey)
  const month = Number(dateKey.slice(5, 7))
  return month >= 7 ? year : year - 1
}

function normalizeYearData(data) {
  return Object.fromEntries(
    Object.entries(data || {}).flatMap(([dateKey, record]) => {
      const rawRecord = typeof record === 'string' ? { code: record } : record || {}
      const code = normalizeAttendanceCode(rawRecord.code || '')
      if (!code) return []
      const note = typeof rawRecord.note === 'string' ? rawRecord.note.trim() : ''
      return [[dateKey, {
        code,
        date: rawRecord.date || dateKey,
        ...(note ? { note } : {}),
      }]]
    })
  )
}

export function getEmployeeYearAttendance(empId, year) {
  try {
    const saved = localStorage.getItem(storageKey(empId, year))
    return normalizeYearData(saved ? JSON.parse(saved) : {})
  } catch {
    return {}
  }
}

export function getAttendanceRecord(empId, dateKey) {
  const yearData = getEmployeeYearAttendance(empId, calendarYearOf(dateKey))
  return yearData[dateKey] || null
}

export function getAttendanceCode(empId, dateKey) {
  return getAttendanceRecord(empId, dateKey)?.code || ''
}

function getSchoolYearAttendance(empId, startYear) {
  const startDate = `${startYear}-07-01`
  const endDate = `${startYear + 1}-06-30`
  const records = {
    ...getEmployeeYearAttendance(empId, startYear),
    ...getEmployeeYearAttendance(empId, startYear + 1),
  }
  return Object.fromEntries(
    Object.entries(records).filter(([dateKey]) => dateKey >= startDate && dateKey <= endDate)
  )
}

function saveYearData(empId, year, yearData, changedDateKey) {
  localStorage.setItem(storageKey(empId, year), JSON.stringify(yearData))
  const schoolYearStart = schoolYearStartOf(changedDateKey)
  checkAndFlag(empId, schoolYearStart, getSchoolYearAttendance(empId, schoolYearStart))
}

// Sets or clears one attendance record. Passing note as undefined preserves an
// existing comment; passing an empty string removes it.
export function setAttendanceRecord(empId, dateKey, { code, note } = {}) {
  const year = calendarYearOf(dateKey)
  const yearData = getEmployeeYearAttendance(empId, year)
  const normalizedCode = normalizeAttendanceCode(code || '')

  if (!normalizedCode) {
    delete yearData[dateKey]
  } else {
    const current = yearData[dateKey] || {}
    const nextNote = note === undefined ? current.note || '' : String(note).trim()
    yearData[dateKey] = {
      code: normalizedCode,
      date: dateKey,
      ...(nextNote ? { note: nextNote } : {}),
    }
  }

  saveYearData(empId, year, yearData, dateKey)
  return yearData
}

export function setAttendanceCode(empId, dateKey, code, note) {
  return setAttendanceRecord(empId, dateKey, { code, note })
}

export function setAttendanceNote(empId, dateKey, note) {
  const current = getAttendanceRecord(empId, dateKey)
  if (!current) return getEmployeeYearAttendance(empId, calendarYearOf(dateKey))
  return setAttendanceRecord(empId, dateKey, { code: current.code, note })
}
