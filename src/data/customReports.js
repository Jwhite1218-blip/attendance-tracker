import { formatBirthday, T_SHIRT_SIZE_SUGGESTIONS } from './employeeFields.js'
import { LOCATION_MAP } from './locations.js'

export const EMPLOYEE_REPORT_FIELDS = [
  { id: 'employee_id', label: 'Employee ID', value: employee => employee.kronos_id || employee.id || '' },
  { id: 'first_name', label: 'First Name', value: employee => employee.first_name || '' },
  { id: 'last_name', label: 'Last Name', value: employee => employee.last_name || '' },
  { id: 'position', label: 'Position', value: employee => employee.position || '' },
  { id: 'school', label: 'School', value: employee => LOCATION_MAP[employee.location]?.name || employee.location || '' },
  { id: 'hire_date', label: 'Hire Date', value: employee => employee.hire_date || '' },
  { id: 'service_date', label: 'Service Date', value: employee => employee.service_date || '' },
  { id: 'birthday', label: 'Birthday', value: employee => employee.birthdate ? formatBirthday(employee.birthdate) : '' },
  { id: 't_shirt_size', label: 'T-shirt Size', value: employee => employee.t_shirt_size || '' },
]

const FIELD_MAP = Object.fromEntries(EMPLOYEE_REPORT_FIELDS.map(field => [field.id, field]))

export function filterEmployeesByLocations(employees, locationIds) {
  const selectedLocations = new Set(locationIds)
  return employees
    .filter(employee => selectedLocations.has(employee.location))
    .sort((a, b) => {
      const locationDifference = (LOCATION_MAP[a.location]?.sort || 999) - (LOCATION_MAP[b.location]?.sort || 999)
      if (locationDifference !== 0) return locationDifference
      const lastNameDifference = String(a.last_name || '').localeCompare(String(b.last_name || ''))
      if (lastNameDifference !== 0) return lastNameDifference
      return String(a.first_name || '').localeCompare(String(b.first_name || ''))
    })
}

export function buildEmployeeReport(employees, locationIds, fieldIds) {
  const columns = fieldIds.map(fieldId => FIELD_MAP[fieldId]).filter(Boolean)
  const selectedEmployees = filterEmployeesByLocations(employees, locationIds)
  const rows = selectedEmployees.map(employee => Object.fromEntries(
    columns.map(column => [column.id, column.value(employee)])
  ))

  return { columns, rows }
}

function escapeCsvValue(value) {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function reportToCsv(report) {
  const header = report.columns.map(column => escapeCsvValue(column.label)).join(',')
  const rows = report.rows.map(row => (
    report.columns.map(column => escapeCsvValue(row[column.id])).join(',')
  ))
  return [header, ...rows].join('\r\n')
}

export function summarizeTShirtSizes(employees) {
  const counts = new Map()
  employees.forEach(employee => {
    const size = String(employee.t_shirt_size || '').trim() || 'Not provided'
    counts.set(size, (counts.get(size) || 0) + 1)
  })

  const knownOrder = new Map(T_SHIRT_SIZE_SUGGESTIONS.map((size, index) => [size, index]))
  return [...counts.entries()]
    .map(([size, count]) => ({ size, count }))
    .sort((a, b) => {
      if (a.size === 'Not provided') return 1
      if (b.size === 'Not provided') return -1
      const aOrder = knownOrder.get(a.size)
      const bOrder = knownOrder.get(b.size)
      if (aOrder != null || bOrder != null) return (aOrder ?? 999) - (bOrder ?? 999)
      return a.size.localeCompare(b.size)
    })
}
