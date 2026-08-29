// Pure row-shaping for one employee's attendance ledger — shared by the
// print view (EmployeeDetail.jsx) and the .xlsx export so both always show
// the same rows in the same order.
import { CODE_MAP } from './attendanceCodes.js'
import { LOCATION_MAP } from './locations.js'

export function buildEmployeeHistoryRows(attendance) {
  return Object.values(attendance || {})
    .filter(record => record?.code)
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function buildEmployeeHistorySheetRows(rows) {
  return rows.map(record => ({
    Date: record.date,
    Code: record.code,
    Description: CODE_MAP[record.code]?.label || record.code,
    Comment: record.note || '',
  }))
}

// A few plain rows above the header, matching the identifying info printed
// at the top of the paper ledger, so an exported file is traceable back to
// the employee and range it came from even once it's out of the app.
export function buildEmployeeHistoryHeaderRows(employee, yearLabel, now = new Date()) {
  return [
    [`Attendance Ledger — ${yearLabel}`],
    [`${`${employee?.first_name || ''} ${employee?.last_name || ''}`.trim()} · ID: ${employee?.kronos_id || ''}`],
    [`${employee?.position || ''} · ${LOCATION_MAP[employee?.location]?.name || employee?.location || 'Unassigned'}`],
    [`Exported ${now.toLocaleDateString('en-US', { dateStyle: 'medium' })}`],
    [],
  ]
}

export function buildEmployeeHistoryFilename(employee, yearLabel) {
  const namePart = `${employee?.last_name || ''}-${employee?.first_name || ''}`
    .replace(/[^a-zA-Z0-9-]+/g, '')
    .toLowerCase() || 'employee'
  const yearPart = String(yearLabel).replace(/\s+/g, '-').toLowerCase()
  return `attendance-history-${namePart}-${yearPart}.xlsx`
}
