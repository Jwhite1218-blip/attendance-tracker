import { useState } from 'react'
import { useProgramTerms } from '../components/useProgramTerms.js'
import { Link, useNavigate } from 'react-router-dom'
import { LOCATIONS, LOCATION_MAP } from '../data/locations.js'
import { getLocationCounts, getEmployeesWithEffectiveLocations } from '../data/employeeLocations.js'
import { getEmployeeAttendanceYears, getEmployeeYearAttendance } from '../data/attendanceStore.js'
import { getAllFlaggedEmployees, mainPageFlagged, splitFlaggedByEmploymentStatus } from '../data/hrFlags.js'
import { ATTENDANCE_CODES, CODE_MAP } from '../data/attendanceCodes.js'
import { getCurrentMonthBirthdays, getUpcomingRequestedTimeOff } from '../data/dashboardInsights.js'
import { canAccessRecognitionProgram, canSeeLizFutureTools, canViewReports, hasLizAdminAccess } from '../data/futureTools.js'
import {
  RECOGNITION_TYPE_MAP,
  aceBucksInSchoolYear,
  dailyStarsInMonth,
  getAllRecognitions,
  recognitionsOfTypeInSchoolYear,
  schoolYearStartFor,
} from '../data/recognitionStore.js'
import { getEmployeeByKey } from '../data/employeeLocations.js'
import HrFollowUpPanel from '../components/HrFollowUpPanel.jsx'
import { useAuth } from '../components/PinGate.jsx'

const PROFESSIONAL_STANDARDS_URL = String(import.meta.env.VITE_PROFESSIONAL_STANDARDS_URL || '').trim()

export default function Dashboard() {
  const access = useAuth()
  const navigate = useNavigate()
  const showLizFutureTools = canSeeLizFutureTools(access)
  const lizAdminAccess = hasLizAdminAccess(access)
  const recognitionAdminAccess = canAccessRecognitionProgram(access)
  const seesReports = canViewReports(access)
  const [activeDrilldown, setActiveDrilldown] = useState(null)
  const [activeRecognition, setActiveRecognition] = useState(null)

  // Which schools this dashboard is reporting on. Liz, 2026-10-26: one or
  // more, with an All-district toggle that is where everybody starts.
  //
  // An empty set means the whole district rather than nothing, because that
  // is the useful default and it keeps the two states — "all" and "some" —
  // from needing a second flag to tell them apart. Held per tab, so a
  // narrowed view does not follow somebody into tomorrow.
  const [selectedSchools, setSelectedSchools] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('attendance-dashboard-schools') || '[]')
      return new Set(Array.isArray(saved) ? saved : [])
    } catch {
      return new Set()
    }
  })
  const rememberSchools = next => {
    setSelectedSchools(next)
    try {
      sessionStorage.setItem('attendance-dashboard-schools', JSON.stringify([...next]))
    } catch { /* private window */ }
  }
  const showingWholeDistrict = selectedSchools.size === 0
  const inScope = employee => showingWholeDistrict || selectedSchools.has(employee.location)

  const everyEmployee = getEmployeesWithEffectiveLocations()
  const everyEmployeeIncludingInactive = getEmployeesWithEffectiveLocations({ includeInactive: true })
  const employees = everyEmployee.filter(inScope)
  const allEmployees = everyEmployeeIncludingInactive.filter(inScope)
  const inactiveEmployees = allEmployees.filter(employee => !employee.active)
  const totalEmployees = employees.length
  const locationCounts = getLocationCounts()
  const scopedLocationIds = showingWholeDistrict
    ? Object.keys(locationCounts)
    : [...selectedSchools].filter(id => locationCounts[id])

  const allFlaggedEmployees = getAllFlaggedEmployees()
    .map(flag => ({ ...flag, employee: allEmployees.find(e => String(e.kronos_id || e.id) === String(flag.empId)) }))
    .filter(f => f.employee)
  // Inactive staff keep their flag but leave the watch list — see
  // splitFlaggedByEmploymentStatus. Their status shows on the /staff page and
  // returns to the main list if they are reactivated.
  const { active: activeFlaggedEmployees } = splitFlaggedByEmploymentStatus(allFlaggedEmployees)
  // Third occurrences are tracked and visible in the building view, but the
  // district front page lists only the fourth and up — see mainPageFlagged.
  const flaggedEmployees = mainPageFlagged(activeFlaggedEmployees)

  const openEmployeeRecord = employee => {
    const employeeId = employee.kronos_id || employee.id
    navigate(`/employee/${encodeURIComponent(employeeId)}`)
  }

  // Load all attendance from localStorage for current year
  const today = new Date()
  const year = today.getFullYear()
  const monthName = today.toLocaleDateString('en-US', { month: 'long' })
  const monthKey = `${year}-${String(today.getMonth() + 1).padStart(2, '0')}`
  let totalMarked = 0
  let totalByCode = {}
  ATTENDANCE_CODES.forEach(c => { if (c.code) totalByCode[c.code] = 0 })

  // Two tallies over the same pass. The year-to-date figures still feed the
  // summary panel that is labelled year-to-date; the month figures are what
  // the tile and its drill-down now report.
  //
  // Liz, 2026-10-26: a year count climbs all year and never comes back down,
  // so by spring it says nothing about whether this month is going well.
  const employeeExceptions = []
  let monthMarked = 0
  employees.forEach(emp => {
    const records = getEmployeeYearAttendance(emp.kronos_id || emp.id, year)
    const byCode = {}
    let empCount = 0
    Object.entries(records).forEach(([dateKey, r]) => {
      if (!r.code) return
      totalMarked++
      totalByCode[r.code] = (totalByCode[r.code] || 0) + 1
      if (!String(dateKey).startsWith(`${monthKey}-`)) return
      monthMarked++
      empCount++
      byCode[r.code] = (byCode[r.code] || 0) + 1
    })
    if (empCount > 0) employeeExceptions.push({ employee: emp, count: empCount, byCode })
  })
  employeeExceptions.sort((a, b) => b.count - a.count)

  // The four recognition figures, scoped by the same pills as everything
  // else on the page. Each one is a list, and its tile shows that list's
  // length, so the number and the rows that open under it are the same
  // thing read twice.
  //
  // Liz, 2026-10-26: stars by the month, the other three by the school
  // year. Stars are the daily rhythm — a running total says nothing about
  // how this month is going. The other three are rare enough that a month
  // of them would usually read nought.
  const recognitions = recognitionAdminAccess ? getAllRecognitions() : []
  const recognitionScope = showingWholeDistrict ? [] : scopedLocationIds
  const schoolYearStart = schoolYearStartFor(today)
  const schoolYearLabel = `${schoolYearStart}–${String(schoolYearStart + 1).slice(2)}`
  const recognitionTiles = [
    {
      id: 'stars',
      label: `Stars in ${monthName}`,
      period: `${monthName} ${year}`,
      records: dailyStarsInMonth(recognitions, monthKey, recognitionScope),
    },
    {
      id: 'ace-buck',
      label: 'ACE Bucks',
      period: schoolYearLabel,
      records: aceBucksInSchoolYear(recognitions, schoolYearStart, recognitionScope),
    },
    {
      id: 'shooting-star',
      label: 'Shooting Star Nominations',
      period: schoolYearLabel,
      records: recognitionsOfTypeInSchoolYear(recognitions, 'shooting-star', schoolYearStart, recognitionScope),
    },
    {
      id: 'star-shout-out',
      label: 'Warren Star Shout-Outs',
      period: schoolYearLabel,
      records: recognitionsOfTypeInSchoolYear(recognitions, 'star-shout-out', schoolYearStart, recognitionScope),
    },
  ]
  const openRecognitionTile = recognitionTiles.find(tile => tile.id === activeRecognition) || null

  const birthdays = getCurrentMonthBirthdays(employees, today)
  const requestedTimeOff = getUpcomingRequestedTimeOff(employees, employee => {
    const empKey = employee.kronos_id || employee.id
    const attendanceYears = new Set([
      year,
      ...getEmployeeAttendanceYears(empKey).filter(attendanceYear => attendanceYear >= year),
    ])
    return Object.assign({}, ...[...attendanceYears].map(attendanceYear => getEmployeeYearAttendance(empKey, attendanceYear)))
  }, today)

  const drilldowns = [
    {
      id: 'birthdays',
      label: `${monthName} Birthdays`,
      count: birthdays.length,
      description: 'All active staff celebrating this month',
    },
    {
      id: 'time-off',
      label: 'Upcoming Requested Time Off',
      count: requestedTimeOff.length,
      description: 'Approved full and half days from today forward',
    },
    // Not a count — a way in. It sits here rather than in the header
    // because Liz asked for it beside the time-off tile: the two answer
    // "what is happening today and next week", which is the same question.
    seesReports && {
      id: 'daily-report',
      to: '/reports/daily',
      label: 'Daily Report',
      description: "Today's exceptions across every school, printable",
    },
    {
      id: 'exceptions',
      label: `${monthName} Exceptions`,
      count: monthMarked,
      description: 'Marked attendance exceptions so far this month',
    },
  ].filter(Boolean)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-charcoal-200 mt-1">
            {showingWholeDistrict
              ? `${LOCATIONS.length} locations`
              : `${selectedSchools.size} of ${LOCATIONS.length} locations`} · {totalEmployees} employees · {year} attendance year
          </p>
        </div>
        <div className="self-start sm:self-auto flex flex-wrap items-stretch gap-3">
          {recognitionAdminAccess && (
            <Link
              to="/recognition"
              className="inline-flex items-center gap-3 rounded-xl border border-[#d9b03f]/70 bg-[#9b651a] px-4 py-3 text-white shadow-sm transition-colors hover:bg-[#b47b23]"
            >
              <span className="w-9 h-9 rounded-lg bg-black/20 flex items-center justify-center text-xl text-[#ffe177]" aria-hidden="true">★</span>
              <span>
                <span className="block text-sm font-bold">All-Star Recognition</span>
                <span className="block text-[11px] text-amber-100 mt-0.5">Catch someone shining</span>
              </span>
            </Link>
          )}
          {lizAdminAccess && (
            <Link
              to="/backup-recovery"
              className="inline-flex items-center gap-3 rounded-xl border border-emerald-400/60 bg-emerald-700 px-4 py-3 text-white shadow-sm transition-colors hover:bg-emerald-600"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-lg" aria-hidden="true">↻</span>
              <span>
                <span className="block text-sm font-bold">Backup & Recovery</span>
                <span className="mt-0.5 block text-[11px] text-emerald-100">Liz self-service protection</span>
              </span>
            </Link>
          )}
          {showLizFutureTools && (
            <FutureToolButton
              symbol="✓"
              title="Professional Standards"
              url={PROFESSIONAL_STANDARDS_URL}
            />
          )}
        </div>
      </div>

      {/* Dashboard drill-downs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        {drilldowns.map(item => (item.to ? (
          <Link
            key={item.id}
            to={item.to}
            className="bg-white rounded-xl border border-gray-200 p-5 transition-all hover:border-brand-300 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">{item.label}</p>
                <p className="text-xs text-gray-400 mt-1">{item.description}</p>
              </div>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700" aria-hidden="true">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </span>
            </div>
            <p className="text-xs font-semibold text-brand-600 mt-4">Open report</p>
          </Link>
        ) : (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveDrilldown(current => current === item.id ? null : item.id)}
            aria-expanded={activeDrilldown === item.id}
            aria-controls="dashboard-drilldown"
            className={`bg-white rounded-xl border p-5 text-left transition-all hover:border-brand-300 hover:shadow-md ${
              activeDrilldown === item.id ? 'border-brand-400 ring-2 ring-brand-100' : 'border-gray-200'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">{item.label}</p>
                <p className="text-xs text-gray-400 mt-1">{item.description}</p>
              </div>
              <span className="inline-flex min-w-9 h-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700 text-lg font-bold">
                {item.count}
              </span>
            </div>
            <p className="text-xs font-semibold text-brand-600 mt-4">
              {activeDrilldown === item.id ? 'Hide details' : 'View details'}
            </p>
          </button>
        )))}
      </div>

      {activeDrilldown && (
        <DashboardDrilldown
          id="dashboard-drilldown"
          type={activeDrilldown}
          monthName={monthName}
          birthdays={birthdays}
          requestedTimeOff={requestedTimeOff}
          employeeExceptions={employeeExceptions}
        />
      )}

      <SchoolFilter
        locationCounts={locationCounts}
        selected={selectedSchools}
        onChange={rememberSchools}
      />

      {/* Stats Row */}
      {/* Inactive headcount is deliberately absent: it lives on /staff with the
          records themselves, so the front page reports only active operations. */}
      <div className={`grid grid-cols-1 sm:grid-cols-3 gap-4 ${recognitionAdminAccess ? 'mb-4' : 'mb-8'}`}>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-500">Locations</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{scopedLocationIds.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-500">Active Staff</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{totalEmployees}</p>
        </div>
        {/* Employee Management — the inactive roster itself lives on /staff so
            a departed employee does not sit on the front page looking like an
            active concern. Liz, 2026-10-26, moved it up beside the headcount
            it belongs with. */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col">
          <p className="text-sm font-medium text-gray-500">Employee Management</p>
          <p className="text-xs text-gray-400 mt-1">
            Add employees or restore inactive ones. Attendance history stays attached.
          </p>
          <Link
            to="/staff"
            className="mt-auto pt-3 self-start inline-flex items-center rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Manage employees
            {inactiveEmployees.length > 0 && (
              <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">
                {inactiveEmployees.length} inactive
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Recognition — its own line, per Liz on 2026-10-26, so the four
          programme figures read as one set rather than as leftovers beside
          the headcounts. Each opens the records it counted. */}
      {recognitionAdminAccess && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
            {recognitionTiles.map(tile => (
              <button
                key={tile.id}
                type="button"
                onClick={() => setActiveRecognition(current => current === tile.id ? null : tile.id)}
                aria-expanded={activeRecognition === tile.id}
                aria-controls="recognition-drilldown"
                className={`bg-white rounded-xl border p-5 text-left transition-all hover:border-brand-300 hover:shadow-md ${
                  activeRecognition === tile.id ? 'border-brand-400 ring-2 ring-brand-100' : 'border-gray-200'
                }`}
              >
                <p className="text-sm font-medium text-gray-500">{tile.label}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{tile.records.length}</p>
                <p className="text-xs text-gray-400 mt-1">{tile.period}</p>
                <p className="text-xs font-semibold text-brand-600 mt-3">
                  {activeRecognition === tile.id ? 'Hide details' : 'View details'}
                </p>
              </button>
            ))}
          </div>

          {openRecognitionTile && (
            <RecognitionDrilldown id="recognition-drilldown" tile={openRecognitionTile} />
          )}
        </>
      )}

      {/* HR Attendance Flags */}
      <HrFollowUpPanel flaggedEmployees={flaggedEmployees} onEmployeeSelect={openEmployeeRecord} />

      {/* Quick Code Summary */}
      {totalMarked > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Year-to-Date Summary</h2>
          <div className="flex flex-wrap gap-3">
            {ATTENDANCE_CODES.filter(c => c.code && totalByCode[c.code] > 0).map(c => (
              <div key={c.code} className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center rounded text-xs font-bold border px-1.5 py-0.5 min-w-[28px]"
                  style={{ backgroundColor: c.hex.bg, color: c.hex.text, borderColor: c.hex.border }}>{c.shortLabel}</span>
                <span className="text-sm font-semibold text-gray-700">{totalByCode[c.code]}</span>
                <span className="text-xs text-gray-400">{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}

function FutureToolButton({ symbol, title, url }) {
  const content = (
    <>
      <span className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-lg" aria-hidden="true">{symbol}</span>
      <span>
        <span className="block text-sm font-bold">{title}</span>
        <span className="block text-[11px] text-brand-100 mt-0.5">
          {url ? 'Open tracker' : 'Setup pending · Liz only'}
        </span>
      </span>
      {url && (
        <svg className="w-4 h-4 text-brand-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14 3h7m0 0v7m0-7L10 14M5 5h5M5 5v14h14v-5" />
        </svg>
      )}
    </>
  )

  const className = `inline-flex items-center gap-3 rounded-xl border border-brand-500/50 bg-brand-600 px-4 py-3 text-white shadow-sm transition-colors ${
    url ? 'hover:bg-brand-500' : 'cursor-not-allowed opacity-75'
  }`

  if (url) {
    return <a href={url} target="_blank" rel="noreferrer" className={className}>{content}</a>
  }

  return <button type="button" disabled className={className} title="Awaiting Liz's approved parameters">{content}</button>
}

// What opens under a recognition tile.
//
// Deliberately a different component from DashboardDrilldown, which is
// built around an employee and the dates attached to them. These rows are
// built around a recognition record: one award, one date, one reason. The
// two were nearly merged and the merged version needed a branch in every
// field, which is how a list quietly starts showing the wrong thing.
//
// The record carries an employee id rather than a name, so names are looked
// up here. An award for somebody since removed from the roster still shows
// — it happened, and dropping the row would make the count look wrong.
function RecognitionDrilldown({ id, tile }) {
  const term = useProgramTerms()
  const records = tile.records

  return (
    <section id={id} className="bg-white rounded-xl border border-brand-200 p-5 mb-8" aria-live="polite">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-gray-800">{tile.label} · {tile.period}</h2>
        <span className="text-xs font-medium text-gray-400">{records.length} record{records.length === 1 ? '' : 's'}</span>
      </div>

      {records.length === 0 ? (
        <p className="text-sm text-gray-400 py-3">Nothing recorded for this period yet.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {records.map(record => {
            const employee = getEmployeeByKey(record.employeeId)
            const name = employee
              ? `${employee.first_name} ${employee.last_name}`
              : `Employee ${record.employeeId}`
            const school = LOCATION_MAP[record.locationId]?.name || record.locationId || 'No school recorded'
            const reasons = (Array.isArray(record.criteria) ? record.criteria : [])
              .map(criterion => term.reason(criterion))
              .filter(Boolean)

            return (
              <div key={record.id} className="py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1.5 sm:gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {school}
                    {record.recognizedBy ? ` · from ${record.recognizedBy}` : ''}
                    {record.sourceName ? ` · ${record.sourceName}` : ''}
                  </p>
                  {reasons.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {reasons.map(reason => (
                        <span key={reason} className="text-[10px] font-medium bg-brand-50 text-brand-700 border border-brand-200 rounded px-1.5 py-0.5">
                          {reason}
                        </span>
                      ))}
                    </div>
                  )}
                  {record.note && <p className="text-xs text-gray-500 mt-1">{record.note}</p>}
                </div>
                <div className="sm:text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-brand-700">{formatDateKey(record.date)}</p>
                  <p className="text-xs text-gray-400">
                    {term.recognitionLabel(record.type, RECOGNITION_TYPE_MAP[record.type]?.shortLabel || record.type)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function DashboardDrilldown({ id, type, monthName, birthdays, requestedTimeOff, employeeExceptions }) {
  const term = useProgramTerms()
  const title = type === 'birthdays'
    ? `${monthName} Birthdays`
    : type === 'exceptions'
      ? `Employees With ${monthName} Exceptions`
      : 'Upcoming Requested Time Off'

  const items = type === 'birthdays' ? birthdays
    : type === 'exceptions' ? employeeExceptions
    : requestedTimeOff

  return (
    <section id={id} className="bg-white rounded-xl border border-brand-200 p-5 mb-8" aria-live="polite">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        <span className="text-xs font-medium text-gray-400">{items.length} record{items.length === 1 ? '' : 's'}</span>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-gray-400 py-3">No matching employee cards.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {items.map(item => {
            const employee = item.employee
            const employeeKey = employee.kronos_id || employee.id
            const locationName = LOCATION_MAP[employee.location]?.name || employee.location || 'No location assigned'

            return (
              <div key={`${employeeKey}-${item.dateKey || item.day || 'exceptions'}`} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{employee.first_name} {employee.last_name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{locationName} · {employee.position || 'Position not listed'}</p>
                  {type === 'time-off' && item.record.note && (
                    <p className="text-xs text-gray-500 mt-1">{item.record.note}</p>
                  )}
                  {type === 'exceptions' && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {Object.entries(item.byCode).map(([code, count]) => (
                        <span key={code} className="text-[10px] font-medium bg-brand-50 text-brand-700 border border-brand-200 rounded px-1.5 py-0.5">
                          {CODE_MAP[code]?.shortLabel || code} × {count}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="sm:text-right flex-shrink-0">
                  {type === 'birthdays' && <p className="text-sm font-semibold text-brand-700">{monthName} {item.day}</p>}
                  {type === 'time-off' && (
                    <>
                      <p className="text-sm font-semibold text-brand-700">{formatDateKey(item.dateKey)}</p>
                      <p className="text-xs text-gray-400">{term.codeLabel(item.record.code, CODE_MAP[item.record.code]?.label || item.record.code)}</p>
                    </>
                  )}
                  {type === 'exceptions' && (
                    <p className="text-sm font-semibold text-brand-700">{item.count} this month</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function formatDateKey(dateKey) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// Which schools the dashboard is reporting on.
//
// Liz, 2026-10-26: pills rather than the card grid this replaces, any
// number of schools at once, and an All-district toggle that is the
// default. Fifteen cards was five rows of boxes before anybody reached a
// number; fifteen pills is two rows above them.
//
// The cards were also the way into a school's attendance tracker, so that
// has to survive: narrow to exactly one and a button appears to open it.
function SchoolFilter({ locationCounts, selected, onChange }) {
  const schools = LOCATIONS
    .filter(location => locationCounts[location.id])
    .sort((left, right) => left.name.localeCompare(right.name))

  const everywhere = selected.size === 0
  const toggle = id => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }
  return (
    <section className="mb-8 rounded-xl border border-charcoal-600 bg-charcoal-800 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-white">Schools</h2>
        <p className="text-xs text-charcoal-200">
          {everywhere
            ? 'Showing every school. Tap any to narrow.'
            : `Showing ${selected.size} of ${schools.length}. Tap to add or remove.`}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange(new Set())}
          aria-current={everywhere ? 'true' : undefined}
          className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
            everywhere
              ? 'border-brand-400 bg-brand-500 text-white'
              : 'border-charcoal-500 bg-charcoal-700 text-charcoal-100 hover:bg-charcoal-600'
          }`}
        >
          All district
        </button>

        {schools.map(school => {
          const on = selected.has(school.id)
          return (
            <button
              key={school.id}
              type="button"
              onClick={() => toggle(school.id)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                on
                  ? 'border-brand-400 bg-brand-500 text-white'
                  : 'border-charcoal-500 bg-charcoal-700 text-charcoal-100 hover:bg-charcoal-600'
              }`}
            >
              {school.name}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                on ? 'bg-white/20 text-white' : 'bg-charcoal-900/60 text-charcoal-200'
              }`}>
                {locationCounts[school.id]}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
