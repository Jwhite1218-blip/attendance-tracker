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

// People with an attendance mark on one day. A blank day is not stored: the
// tracker only records exceptions, so this is who was marked, not who came in.
//
// readRecord is injected, same as the other collectors, so the test does not
// need the browser store. It receives (employeeId, dateKey) and returns the
// stored record or nothing.
export function peopleMarkedOn(roster, dateKey, readRecord) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) return []
  return (roster || [])
    .flatMap(employee => {
      const record = readRecord?.(employee.kronos_id || employee.id, dateKey)
      const code = String(record?.code || '').trim()
      if (!code) return []
      return [{
        employee,
        code,
        note: typeof record?.note === 'string' ? record.note.trim() : '',
      }]
    })
    .sort((left, right) => {
      const last = String(left.employee?.last_name || '').localeCompare(
        String(right.employee?.last_name || ''),
        undefined,
        { sensitivity: 'base' },
      )
      if (last) return last
      return String(left.employee?.first_name || '').localeCompare(
        String(right.employee?.first_name || ''),
        undefined,
        { sensitivity: 'base' },
      )
    })
}

// Every marked exception in one calendar month, oldest first.
//
// Liz, 2026-10-26, merging the two dashboards: the district page counted a
// month and a building's page counted a week, which made the same-looking
// tile mean two different things depending on who was signed in. Both now
// ask this.
//
// readYearAttendance is injected for the same reason as above: the store it
// would otherwise import reaches for localStorage.
export function collectMonthExceptions(roster, monthKey, readYearAttendance) {
  const year = Number(String(monthKey).slice(0, 4))
  const list = []
  ;(roster || []).forEach(employee => {
    const records = readYearAttendance(employee.kronos_id || employee.id, year) || {}
    Object.entries(records).forEach(([dateKey, record]) => {
      if (!record?.code || !String(dateKey).startsWith(`${monthKey}-`)) return
      list.push({ employee, dateKey, code: record.code, note: record.note })
    })
  })
  return list.sort((left, right) => (
    left.dateKey.localeCompare(right.dateKey) || compareEmployees(left, right)
  ))
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
