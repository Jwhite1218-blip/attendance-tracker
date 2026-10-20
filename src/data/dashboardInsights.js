import { getBirthdayMonthDay } from './employeeFields.js'

const REQUESTED_TIME_OFF_CODES = new Set(['RTO', 'RTO.5'])

function employeeName(employee) {
  return `${employee.first_name || ''} ${employee.last_name || ''}`.trim()
}

function compareEmployees(a, b) {
  return employeeName(a.employee).localeCompare(employeeName(b.employee))
}

function localDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export function getCurrentMonthBirthdays(employees, referenceDate = new Date()) {
  const month = referenceDate.getMonth() + 1
  return employees
    .flatMap(employee => {
      const birthday = getBirthdayMonthDay(employee.birthdate)
      return birthday?.month === month ? [{ employee, day: birthday.day }] : []
    })
    .sort((a, b) => a.day - b.day || compareEmployees(a, b))
}

// Work anniversaries were removed on 2026-10-20. They were the only thing
// hire_date fed, and Liz found the hire dates in the district's own files
// were not up to date — so the feature was congratulating people on the
// wrong date. Recognition built on data nobody trusts is worse than no
// recognition. The field went with it.

export function getUpcomingRequestedTimeOff(employees, getAttendanceRecords, referenceDate = new Date()) {
  const todayKey = localDateKey(referenceDate)

  return employees
    .flatMap(employee => Object.entries(getAttendanceRecords(employee) || {}).flatMap(([dateKey, record]) => {
      if (dateKey < todayKey || !REQUESTED_TIME_OFF_CODES.has(record?.code)) return []
      return [{ employee, dateKey, record }]
    }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || compareEmployees(a, b))
}

// The four cards a school sees, assembled in one place.
//
// LocationView and the manager's Dashboard both show them, and they must not
// drift: two screens disagreeing about how many birthdays a school has this
// month is worse than neither showing it.
//
// readAttendanceForEmployee is injected rather than imported so this stays a
// pure function — attendanceStore reaches for localStorage, which would make
// it untestable under Node.
export function buildSchoolInsights(roster, readAttendanceForEmployee, referenceDate = new Date()) {
  return {
    monthName: referenceDate.toLocaleDateString('en-US', { month: 'long' }),
    birthdays: getCurrentMonthBirthdays(roster, referenceDate),
    requestedTimeOff: getUpcomingRequestedTimeOff(roster, readAttendanceForEmployee, referenceDate),
  }
}

// Every marked exception for a set of days, oldest first.
export function collectWeekExceptions(roster, dates, attendance) {
  const list = []
  ;(roster || []).forEach(employee => {
    ;(dates || []).forEach(dateKey => {
      const record = (attendance || {})[`${employee.kronos_id || employee.id}-${dateKey}`]
      if (record?.code) {
        list.push({ employee, dateKey, code: record.code, note: record.note })
      }
    })
  })
  return list.sort((left, right) => left.dateKey.localeCompare(right.dateKey))
}
