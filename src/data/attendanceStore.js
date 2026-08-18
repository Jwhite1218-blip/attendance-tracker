// Single source of truth for attendance records.
// Every page that marks or reads attendance (Quick Mark, Location weekly grid,
// Employee Detail, Ledger View, Master Report, Dashboard) goes through here so a
// mark made in one view shows up in all the others.
//
// Storage key: att-emp-{employeeId}-{year} -> { [dateKey]: { code, date } }

import { checkAndFlag } from './hrFlags.js'

function storageKey(empId, year) {
  return `att-emp-${empId}-${year}`
}

function yearOf(dateKey) {
  return dateKey.slice(0, 4)
}

export function getEmployeeYearAttendance(empId, year) {
  try {
    const saved = localStorage.getItem(storageKey(empId, year))
    return saved ? JSON.parse(saved) : {}
  } catch {
    return {}
  }
}

export function getAttendanceCode(empId, dateKey) {
  const yearData = getEmployeeYearAttendance(empId, yearOf(dateKey))
  return yearData[dateKey]?.code || ''
}

// Sets (or clears, when code === '') the attendance record for one employee/day.
// Returns the updated year bucket in case the caller wants it.
export function setAttendanceCode(empId, dateKey, code) {
  const year = yearOf(dateKey)
  const yearData = getEmployeeYearAttendance(empId, year)
  if (code === '') {
    delete yearData[dateKey]
  } else {
    yearData[dateKey] = { code, date: dateKey }
  }
  localStorage.setItem(storageKey(empId, year), JSON.stringify(yearData))
  checkAndFlag(empId, year, yearData)
  return yearData
}
