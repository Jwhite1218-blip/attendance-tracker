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
  submitterLocationLabel,
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

// --- counts and rankings ----------------------------------------------------
//
// Jon, 2026-11-11, the same day the leaderboards came off every screen
// people work from: "I would still like to be able to see from my login
// something that shows counts by person, by building, and by who submitted
// recognitions. And the rankings."
//
// So they live here, in a report, for the district administrators who run
// the programme — not on the All-Stars page, where a ranking turns into
// something to beat. Who may see these views is the page's decision
// (hasLizAdminAccess); this module only counts.
//
// Every view takes the same filters as the flat report, so a ranking for
// one building in October is the same records the flat list shows for it.

export const RECOGNITION_COUNT_VIEWS = [
  { id: 'person', label: 'By person' },
  { id: 'building', label: 'By building' },
  { id: 'submitter', label: 'By who submitted' },
]

// Column headings for a count of each award, plural because they head a
// column of totals.
const COUNT_LABELS = {
  'star-of-day': 'Stars of the Day',
  'shooting-star': 'Shooting Stars',
  'star-shout-out': 'Shout-Outs',
  'warren-employee-month': 'Employee of the Month',
  'all-star-of-month': 'Building All-Star',
  'ace-buck': 'Star Coach Bucks',
}

function countColumns(types) {
  const chosen = new Set((types || []).map(String))
  return RECOGNITION_TYPES
    .filter(type => !chosen.size || chosen.has(type.id))
    .map(type => ({ id: `count:${type.id}`, label: COUNT_LABELS[type.id] || type.label, numeric: true }))
}

function tally(records, columns) {
  const counts = Object.fromEntries(columns.map(column => [column.id, 0]))
  for (const record of records) {
    const id = `count:${record.type}`
    if (id in counts) counts[id] += 1
  }
  return { ...counts, total: records.length }
}

// The last seven days of a month — the week a building's drawing opens.
// Stars piling up in it was the pattern that took the leaderboards down.
function inFinalWeek(dateKey) {
  const [year, month, day] = String(dateKey || '').split('-').map(Number)
  if (!year || !month || !day) return false
  return day >= new Date(Date.UTC(year, month, 0)).getUTCDate() - 6
}

// Recorded more than a week after the date it carries.
function enteredLate(record) {
  const entered = Date.parse(record.createdAt || '')
  const dated = Date.parse(`${record.date}T23:59:59`)
  if (Number.isNaN(entered) || Number.isNaN(dated)) return false
  return entered - dated > 7 * 24 * 60 * 60 * 1000
}

function groupBy(records, keyOf) {
  const groups = new Map()
  for (const record of records) {
    const key = keyOf(record)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(record)
  }
  return groups
}

const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0)

// Standard competition ranking: two people level on 5 are both second, and
// the next is fourth. A tie broken by the alphabet would rank somebody
// below a person with exactly the same count.
function rankRows(rows, sortBy, nameColumn) {
  const value = row => Number(row[sortBy]) || 0
  const sorted = [...rows].sort((left, right) => (
    value(right) - value(left)
    || String(left[nameColumn]).localeCompare(String(right[nameColumn]))
  ))
  let rank = 0
  return sorted.map((row, index) => {
    if (index === 0 || value(row) !== value(sorted[index - 1])) rank = index + 1
    return { rank, ...row }
  })
}

// view: 'person' | 'building' | 'submitter'. sortBy: any numeric column id,
// 'total' when not given. The result has the flat report's shape, so the
// same table and the same CSV writer serve it, plus the sort key in use.
//
// resolveEmployee(id) returns the roster record or null; staffByLocation
// maps a building to how many people work there now, for the per-head and
// coverage columns.
export function buildRecognitionCountsReport(records, {
  resolveEmployee = () => null,
  staffByLocation = {},
} = {}, options = {}, { view = 'person', sortBy = 'total' } = {}) {
  const filtered = filterRecognitionsForReport(records, options)
  const counted = countColumns(options.types)
  const numericIds = new Set(['total', ...counted.map(column => column.id)])
  const schoolName = locationId => LOCATION_MAP[locationId]?.name || locationId || ''

  let nameColumn
  let columns
  let rows

  if (view === 'building') {
    nameColumn = 'school'
    columns = [
      { id: 'school', label: 'School' },
      { id: 'staff', label: 'Staff now', numeric: true },
      { id: 'people', label: 'People recognized', numeric: true },
      { id: 'coverage', label: 'Staff recognized (%)', numeric: true },
      ...counted,
      { id: 'total', label: 'Total', numeric: true },
      { id: 'per_staff', label: 'Per staff member', numeric: true },
    ]
    rows = [...groupBy(filtered, record => String(record.locationId || ''))].map(([locationId, group]) => {
      const staff = Number(staffByLocation[locationId]) || 0
      const people = new Set(group.map(record => String(record.employeeId))).size
      return {
        school: schoolName(locationId),
        staff,
        people,
        coverage: percent(people, staff),
        ...tally(group, counted),
        per_staff: staff ? Math.round((group.length / staff) * 10) / 10 : 0,
      }
    })
  } else if (view === 'submitter') {
    nameColumn = 'submitter'
    columns = [
      { id: 'submitter', label: 'Submitted by' },
      { id: 'login', label: 'Signed in as' },
      ...counted,
      { id: 'total', label: 'Total', numeric: true },
      { id: 'people', label: 'People recognized', numeric: true },
      { id: 'most_to_one', label: 'Most to one person', numeric: true },
      { id: 'final_week', label: 'In last week of month (%)', numeric: true },
      { id: 'entered_late', label: 'Entered 7+ days late', numeric: true },
    ]
    // The name as recorded and the login it came from. Two people sharing
    // a login under one name are one row — the record cannot tell them apart.
    const keyOf = record => [
      String(record.recognizedByLocationId || '').trim(),
      String(record.recognizedBy || '').trim().toLowerCase(),
    ].join('|')
    rows = [...groupBy(filtered, keyOf)].map(([, group]) => {
      const perPerson = [...groupBy(group, record => String(record.employeeId)).values()].map(list => list.length)
      return {
        submitter: String(group[0].recognizedBy || '').trim() || 'Not recorded',
        login: submitterLocationLabel(group[0], LOCATION_MAP),
        ...tally(group, counted),
        people: perPerson.length,
        most_to_one: Math.max(0, ...perPerson),
        final_week: percent(group.filter(record => inFinalWeek(record.date)).length, group.length),
        entered_late: group.filter(enteredLate).length,
      }
    })
  } else {
    nameColumn = 'employee'
    columns = [
      { id: 'employee', label: 'Employee' },
      { id: 'school', label: 'School' },
      { id: 'position', label: 'Position' },
      ...counted,
      { id: 'total', label: 'Total', numeric: true },
    ]
    rows = [...groupBy(filtered, record => String(record.employeeId))].map(([employeeId, group]) => {
      const employee = resolveEmployee(employeeId)
      const latest = group[group.length - 1]
      return {
        employee: employee
          ? `${employee.first_name || ''} ${employee.last_name || ''}`.trim()
          : 'Former employee',
        school: schoolName(employee?.location || latest.locationId),
        position: employee?.position || '',
        ...tally(group, counted),
      }
    })
  }

  for (const column of columns) if (column.numeric) numericIds.add(column.id)
  const sortKey = numericIds.has(sortBy) ? sortBy : 'total'
  return {
    columns: [{ id: 'rank', label: 'Rank', numeric: true }, ...columns],
    rows: rankRows(rows, sortKey, nameColumn),
    sortBy: sortKey,
  }
}

// What the export is called, so a folder of them can be told apart without
// opening any.
export function recognitionReportFilename({ startYear, monthKey = '', types = [] } = {}, view = '') {
  const period = monthKey || `${startYear}-${String(startYear + 1).slice(2)}-school-year`
  const award = types.length === 1
    ? `-${String(types[0])}`
    : ''
  const counts = RECOGNITION_COUNT_VIEWS.some(item => item.id === view) ? `-by-${view}` : ''
  return `recognition-report-${period}${award}${counts}.csv`
}
