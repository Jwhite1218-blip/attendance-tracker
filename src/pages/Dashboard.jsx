import { useState } from 'react'

import { Link, useNavigate } from 'react-router-dom'
import { LOCATIONS, LOCATION_MAP } from '../data/locations.js'
import { getLocationCounts, getEmployeesWithEffectiveLocations } from '../data/employeeLocations.js'
import { getEmployeeAttendanceYears, getEmployeeYearAttendance } from '../data/attendanceStore.js'
import { getAllFlaggedEmployees, mainPageFlagged, splitFlaggedByEmploymentStatus } from '../data/hrFlags.js'
import { ATTENDANCE_CODES } from '../data/attendanceCodes.js'
import { collectMonthExceptions, getCurrentMonthBirthdays, getUpcomingRequestedTimeOff } from '../data/dashboardInsights.js'
import { canAccessRecognitionProgram, canSeeLizFutureTools, canViewReports, hasLizAdminAccess } from '../data/futureTools.js'
import { backupReminder } from '../data/backupReminder.js'
import { lastBackupExport } from '../data/programSettings.js'
import InsightDrilldown from '../components/InsightDrilldown.jsx'
import MetricTile from '../components/MetricTile.jsx'
import RecognitionMetrics, { recognitionTilesFor } from '../components/RecognitionMetrics.jsx'
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
  // Only shown to the one person who can actually run it. Liz, 2026-10-27:
  // "can you set me up a notification at the end of each month within it to
  // remind me to export?"
  const backupDue = lizAdminAccess ? backupReminder(lastBackupExport()) : null
  const [activeDrilldown, setActiveDrilldown] = useState(null)

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

  // Year-to-date, for the panel that is labelled year-to-date.
  employees.forEach(emp => {
    Object.values(getEmployeeYearAttendance(emp.kronos_id || emp.id, year)).forEach(r => {
      if (!r.code) return
      totalMarked++
      totalByCode[r.code] = (totalByCode[r.code] || 0) + 1
    })
  })

  // This month, through the collector a manager's dashboard also uses, so
  // the two pages cannot mean different things by the same tile. Liz,
  // 2026-10-26.
  //
  // One row per exception rather than one per employee: the tile counts
  // marks, so the panel under it has to list marks or the two disagree. It
  // used to read "2 records" under a tile showing 3. Who has the most is
  // the HR follow-up list's question, further down this page.
  const monthExceptions = collectMonthExceptions(employees, monthKey, getEmployeeYearAttendance)

  // Scoped by the same pills as everything else here; an empty list means
  // the whole district, which is what the pills mean too.
  const recognitionTiles = recognitionAdminAccess
    ? recognitionTilesFor({ locationIds: showingWholeDistrict ? [] : scopedLocationIds, today })
    : []

  const birthdays = getCurrentMonthBirthdays(employees, today)
  const requestedTimeOff = getUpcomingRequestedTimeOff(employees, employee => {
    const empKey = employee.kronos_id || employee.id
    const attendanceYears = new Set([
      year,
      ...getEmployeeAttendanceYears(empKey).filter(attendanceYear => attendanceYear >= year),
    ])
    return Object.assign({}, ...[...attendanceYears].map(attendanceYear => getEmployeeYearAttendance(empKey, attendanceYear)))
  }, today)

  const drilldownItems = {
    birthdays,
    'time-off': requestedTimeOff,
    exceptions: monthExceptions,
  }
  const drilldownTitles = {
    birthdays: `${monthName} Birthdays`,
    'time-off': 'Upcoming Requested Time Off',
    exceptions: `${monthName} Exceptions`,
  }

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
      count: '→',
    },
    {
      id: 'exceptions',
      label: `${monthName} Exceptions`,
      count: monthExceptions.length,
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

      {backupDue && <BackupReminderBanner reminder={backupDue} />}

      {/* Dashboard drill-downs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        {drilldowns.map(item => (
          <MetricTile
            key={item.id}
            label={item.label}
            description={item.description}
            count={item.count}
            to={item.to}
            linkLabel="Open report"
            expanded={activeDrilldown === item.id}
            onToggle={item.to ? undefined : () => setActiveDrilldown(current => (current === item.id ? null : item.id))}
            controls="dashboard-drilldown"
          />
        ))}
      </div>

      {activeDrilldown && (
        <InsightDrilldown
          id="dashboard-drilldown"
          type={activeDrilldown}
          title={drilldownTitles[activeDrilldown]}
          monthName={monthName}
          items={drilldownItems[activeDrilldown] || []}
          onEmployeeSelect={openEmployeeRecord}
          showLocation
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
      {recognitionAdminAccess && <RecognitionMetrics tiles={recognitionTiles} />}

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

// The monthly nudge to download a backup.
//
// Amber rather than red: nothing is broken, and a dashboard that cries
// wolf in red every month end stops being read. It disappears the moment
// an export is recorded, so it is never telling her to do something she
// has already done — which is the only way a recurring reminder survives
// contact with a real person.
function BackupReminderBanner({ reminder }) {
  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-bold text-amber-900">{reminder.message}</p>
          <p className="mt-0.5 text-xs text-amber-800">{reminder.detail}</p>
          {reminder.lastExportedAt && (
            <p className="mt-1 text-[11px] text-amber-700">
              Last downloaded {new Date(reminder.lastExportedAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}.
            </p>
          )}
        </div>
        <Link
          to="/backup-recovery"
          className="flex-none self-start rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
        >
          Download backup
        </Link>
      </div>
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
