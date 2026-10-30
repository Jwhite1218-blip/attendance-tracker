// The All-Star recognition export.
//
// Liz, 2026-10-26: "custom report options here for all All-Star Recognition
// awards, to be able to run by building, by award type, by month to be able
// to export."
//
// Three filters, each of which may be left wide open, and a flat table. The
// shape matches the employee custom report so the same CSV writer serves
// both — one escaping routine, not two.
//
// Nothing here reads storage. The page hands in the records and a way to
// look up an employee, which is what makes the filtering testable without
// a browser.
import { LOCATION_MAP } from './locations.js'
import {
  RECOGNITION_TYPES,
  RECOGNITION_TYPE_MAP,
  isRecognitionInSchoolYear,
  schoolYearMonthKeys,
} from './recognitionStore.js'

export const RECOGNITION_REPORT_COLUMNS = [
  { id: 'date', label: 'Date' },
  { id: 'school', label: 'School' },
  { id: 'employee', label: 'Employee' },
  { id: 'position', label: 'Position' },
  { id: 'award', label: 'Award' },
  { id: 'reasons', label: 'Reason' },
  { id: 'given_by', label: 'Given by' },
  { id: 'source', label: 'Nominated by' },
  { id: 'note', label: 'Note' },
]

// Every award type, in the order the recognition page lists them, so the
// report's tick boxes and the form people fill in read the same way round.
export function recognitionReportTypes() {
  return RECOGNITION_TYPES.map(type => ({ id: type.id, label: type.label }))
}

// The months of one school year, newest first, labelled for a dropdown.
// Newest first because the month somebody wants is almost always the one
// just finished, and that should not be at the bottom of twelve.
export function recognitionReportMonths(startYear) {
  return schoolYearMonthKeys(startYear)
    .slice()
    .reverse()
    .map(monthKey => ({
      key: monthKey,
      label: new Date(`${monthKey}-01T12:00:00`).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      }),
    }))
}

// locationIds and types empty mean "every one of them" rather than "none".
//
// That is the opposite of how a tick-box list reads, so the page keeps
// every box ticked by default and this function never has to guess. An
// empty monthKey means the whole school year.
export function filterRecognitionsForReport(records, {
  startYear,
  locationIds = [],
  types = [],
  monthKey = '',
} = {}) {
  const locations = new Set((locationIds || []).map(String))
  const awardTypes = new Set((types || []).map(String))

  return (Array.isArray(records) ? records : [])
    .filter(record => {
      if (!record?.id) return false
      if (startYear != null && !isRecognitionInSchoolYear(record, startYear)) return false
      if (monthKey && !String(record.date || '').startsWith(`${monthKey}-`)) return false
      if (locations.size && !locations.has(String(record.locationId || ''))) return false
      if (awardTypes.size && !awardTypes.has(String(record.type || ''))) return false
      return true
    })
    .sort((left, right) => (
      String(left.date || '').localeCompare(String(right.date || ''))
      || String(left.id).localeCompare(String(right.id))
    ))
}

// resolveEmployee returns the roster record for an id, or null. A null is
// expected rather than exceptional: an award given to somebody since taken
// off the roster still happened, and dropping the row would make the count
// disagree with the dashboard tile it came from.
export function buildRecognitionReport(records, resolveEmployee, options = {}) {
  const rows = filterRecognitionsForReport(records, options).map(record => {
    const employee = resolveEmployee ? resolveEmployee(record.employeeId) : null
    const reasons = (Array.isArray(record.criteria) ? record.criteria : [])
      .map(criterion => String(criterion || '').trim())
      .filter(Boolean)
    const otherReason = String(record.otherReason || '').trim()

    return {
      date: record.date || '',
      school: LOCATION_MAP[record.locationId]?.name || record.locationId || '',
      employee: employee
        ? `${employee.first_name || ''} ${employee.last_name || ''}`.trim()
        // Never the id: it is the payroll number, which is off every screen.
        : 'Former employee',
      position: employee?.position || '',
      award: RECOGNITION_TYPE_MAP[record.type]?.label || record.type || '',
      // The free-text "other" reason is appended rather than replacing the
      // criterion, because "Other" on its own tells a reader nothing and
      // the whole point of the box is what was typed into it.
      reasons: [...reasons, otherReason].filter(Boolean).join('; '),
      given_by: record.recognizedBy || '',
      source: record.sourceName || '',
      note: record.note || '',
    }
  })

  return { columns: RECOGNITION_REPORT_COLUMNS, rows }
}

// What the export is called, so a folder of them can be told apart without
// opening any.
export function recognitionReportFilename({ startYear, monthKey = '', types = [] } = {}) {
  const period = monthKey || `${startYear}-${String(startYear + 1).slice(2)}-school-year`
  const award = types.length === 1
    ? `-${String(types[0])}`
    : ''
  return `recognition-report-${period}${award}.csv`
}
