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

export function getCurrentMonthAnniversaries(employees, referenceDate = new Date()) {
  const month = referenceDate.getMonth() + 1
  const currentYear = referenceDate.getFullYear()

  return employees
    .flatMap(employee => {
      const match = String(employee.hire_date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (!match) return []

      const hireYear = Number(match[1])
      const hireMonth = Number(match[2])
      const day = Number(match[3])
      const years = currentYear - hireYear
      return hireMonth === month && years > 0 ? [{ employee, day, years }] : []
    })
    .sort((a, b) => a.day - b.day || compareEmployees(a, b))
}

export function getUpcomingRequestedTimeOff(employees, getAttendanceRecords, referenceDate = new Date()) {
  const todayKey = localDateKey(referenceDate)

  return employees
    .flatMap(employee => Object.entries(getAttendanceRecords(employee) || {}).flatMap(([dateKey, record]) => {
      if (dateKey < todayKey || !REQUESTED_TIME_OFF_CODES.has(record?.code)) return []
      return [{ employee, dateKey, record }]
    }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || compareEmployees(a, b))
}
