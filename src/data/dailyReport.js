// Today's exceptions across every school — the same content as the automated
// end-of-day email, built from the shared attendance store for an admin who
// wants to see (and print) it from inside the app rather than wait for 5pm.
import { CODE_MAP } from './attendanceCodes.js'
import { LOCATION_MAP } from './locations.js'
import { getAttendanceRecord } from './attendanceStore.js'

export function getTodayDateKey(now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function buildDailyReportRows(employees, dateKey) {
  return employees
    .map(employee => {
      const empId = employee.kronos_id || employee.id
      const record = getAttendanceRecord(empId, dateKey)
      const codeInfo = record?.code ? CODE_MAP[record.code] : null
      if (!codeInfo) return null
      return {
        employeeName: `${employee.first_name} ${employee.last_name}`.trim() || 'Unknown employee',
        locationId: employee.location || '',
        locationName: LOCATION_MAP[employee.location]?.name || employee.location || 'Unknown location',
        code: record.code,
        codeLabel: codeInfo.label,
        note: record.note || '',
      }
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftSort = LOCATION_MAP[left.locationId]?.sort ?? Number.MAX_SAFE_INTEGER
      const rightSort = LOCATION_MAP[right.locationId]?.sort ?? Number.MAX_SAFE_INTEGER
      return leftSort - rightSort
        || left.locationName.localeCompare(right.locationName)
        || left.employeeName.localeCompare(right.employeeName)
    })
}
