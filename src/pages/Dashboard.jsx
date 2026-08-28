import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LOCATIONS, LOCATION_MAP } from '../data/locations.js'
import { getLocationCounts, getEmployeesWithEffectiveLocations, setEmployeeActive } from '../data/employeeLocations.js'
import { getEmployeeAttendanceYears, getEmployeeYearAttendance } from '../data/attendanceStore.js'
import { getAllFlaggedEmployees, getAttendanceStageLabel } from '../data/hrFlags.js'
import { ATTENDANCE_CODES, CODE_MAP } from '../data/attendanceCodes.js'
import { getCurrentMonthAnniversaries, getCurrentMonthBirthdays, getUpcomingRequestedTimeOff } from '../data/dashboardInsights.js'
import { canAccessRecognitionProgram, canSeeLizFutureTools, hasLizAdminAccess } from '../data/futureTools.js'
import AddEmployeeModal from '../components/AddEmployeeModal.jsx'
import { useAuth } from '../components/PinGate.jsx'

const PROFESSIONAL_STANDARDS_URL = String(import.meta.env.VITE_PROFESSIONAL_STANDARDS_URL || '').trim()

export default function Dashboard() {
  const access = useAuth()
  const showLizFutureTools = canSeeLizFutureTools(access)
  const lizAdminAccess = hasLizAdminAccess(access)
  const recognitionAdminAccess = canAccessRecognitionProgram(access)
  const [, setDirectoryVersion] = useState(0)
  const [showAddEmployee, setShowAddEmployee] = useState(false)
  const [activeDrilldown, setActiveDrilldown] = useState(null)
  const employees = getEmployeesWithEffectiveLocations()
  const allEmployees = getEmployeesWithEffectiveLocations({ includeInactive: true })
  const inactiveEmployees = allEmployees.filter(employee => !employee.active)
  const totalEmployees = employees.length
  const locationCounts = getLocationCounts()

  const flaggedEmployees = getAllFlaggedEmployees()
    .map(flag => ({ ...flag, employee: allEmployees.find(e => String(e.kronos_id || e.id) === String(flag.empId)) }))
    .filter(f => f.employee)

  const refreshDirectory = () => setDirectoryVersion(version => version + 1)

  // Load all attendance from localStorage for current year
  const today = new Date()
  const year = today.getFullYear()
  const monthName = today.toLocaleDateString('en-US', { month: 'long' })
  let totalMarked = 0
  let totalByCode = {}
  ATTENDANCE_CODES.forEach(c => { if (c.code) totalByCode[c.code] = 0 })

  const employeeExceptions = []
  employees.forEach(emp => {
    const records = getEmployeeYearAttendance(emp.kronos_id || emp.id, year)
    const byCode = {}
    let empCount = 0
    Object.values(records).forEach(r => {
      if (r.code) {
        totalMarked++
        totalByCode[r.code] = (totalByCode[r.code] || 0) + 1
        empCount++
        byCode[r.code] = (byCode[r.code] || 0) + 1
      }
    })
    if (empCount > 0) employeeExceptions.push({ employee: emp, count: empCount, byCode })
  })
  employeeExceptions.sort((a, b) => b.count - a.count)

  const birthdays = getCurrentMonthBirthdays(employees, today)
  const anniversaries = getCurrentMonthAnniversaries(employees, today)
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
      id: 'anniversaries',
      label: `${monthName} Anniversaries`,
      count: anniversaries.length,
      description: 'Completed work anniversaries this month',
    },
    {
      id: 'time-off',
      label: 'Upcoming Requested Time Off',
      count: requestedTimeOff.length,
      description: 'Approved full and half days from today forward',
    },
    {
      id: 'exceptions',
      label: `Exceptions (${year})`,
      count: totalMarked,
      description: 'Every employee with a marked attendance exception this year',
    },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-charcoal-200 mt-1">
            {LOCATIONS.length} locations · {totalEmployees} employees · {year} attendance year
          </p>
        </div>
        <div className="self-start sm:self-auto flex flex-wrap items-stretch gap-3">
          <Link
            to="/reports/custom"
            className="inline-flex items-center gap-3 rounded-xl border border-charcoal-500 bg-charcoal-700 px-4 py-3 text-white shadow-sm hover:bg-charcoal-600 transition-colors"
          >
            <span className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center" aria-hidden="true">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h6l6 6v10a2 2 0 01-2 2z" />
              </svg>
            </span>
            <span>
              <span className="block text-sm font-bold">Custom Employee Report</span>
              <span className="block text-[11px] text-charcoal-200 mt-0.5">Choose schools and fields</span>
            </span>
          </Link>
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
        {drilldowns.map(item => (
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
        ))}
      </div>

      {activeDrilldown && (
        <DashboardDrilldown
          id="dashboard-drilldown"
          type={activeDrilldown}
          monthName={monthName}
          birthdays={birthdays}
          anniversaries={anniversaries}
          requestedTimeOff={requestedTimeOff}
          employeeExceptions={employeeExceptions}
        />
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-500">Locations</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{Object.keys(locationCounts).length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-500">Active Staff</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{totalEmployees}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-500">Inactive Staff</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{inactiveEmployees.length}</p>
        </div>
      </div>

      {/* HR Attendance Flags */}
      {flaggedEmployees.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200 p-5 mb-8">
          <h2 className="text-sm font-semibold text-red-700 mb-1">HR Attendance Follow-Up</h2>
          <p className="text-xs text-gray-400 mb-3">
            The third qualifying occurrence starts formal tracking, the fourth requires a verbal warning, and two consecutive UNEX workdays reset union seniority.
          </p>
          <div className="divide-y divide-gray-100">
            {flaggedEmployees.map(f => (
              <div key={`${f.empId}-${f.schoolYearStart}`} className="py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-red-600">{f.employee.first_name} {f.employee.last_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {LOCATION_MAP[f.employee.location]?.name || f.employee.location} · {f.employee.position}
                  </p>
                  <p className={`text-xs font-semibold mt-1.5 ${f.seniorityReset ? 'text-red-700' : 'text-amber-700'}`}>
                    {getAttendanceStageLabel(f)} · {f.occurrenceCount} occurrence{f.occurrenceCount === 1 ? '' : 's'} · {f.schoolYearStart}–{f.schoolYearStart + 1}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {f.triggers.map((t, i) => (
                      <span key={i} className="text-[10px] font-medium bg-red-50 text-red-600 border border-red-200 rounded px-1.5 py-0.5">
                        {t.date} · {CODE_MAP[t.code]?.shortLabel}
                      </span>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-gray-400 whitespace-nowrap sm:text-right">
                  Updated {new Date(f.updatedAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* Employee Management */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Employee Management</h2>
            <p className="text-xs text-gray-400 mt-1">
              Add employees or restore inactive records. Existing attendance history stays attached to the employee.
            </p>
          </div>
          {lizAdminAccess ? (
            <button
              type="button"
              onClick={() => setShowAddEmployee(true)}
              className="self-start px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700"
            >
              + Add employee
            </button>
          ) : (
            <span className="self-start rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-500">
              Roster read-only
            </span>
          )}
        </div>

        {inactiveEmployees.length > 0 ? (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Inactive employees</p>
            <div className="divide-y divide-gray-100">
              {inactiveEmployees.map(employee => {
                const empKey = employee.kronos_id || employee.id
                return (
                  <div key={empKey} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{employee.first_name} {employee.last_name}</p>
                      <p className="text-xs text-gray-400">
                        ID: {employee.kronos_id} · {LOCATION_MAP[employee.location]?.name || employee.location}
                        {employee.inactive_reason ? ` · ${employee.inactive_reason}` : ''}
                      </p>
                    </div>
                    {lizAdminAccess && (
                      <button
                        type="button"
                        onClick={() => {
                          setEmployeeActive(empKey, true)
                          refreshDirectory()
                        }}
                        className="self-start sm:self-auto px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100"
                      >
                        Reactivate
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400 mt-4 pt-4 border-t border-gray-100">No inactive employee records.</p>
        )}
      </div>

      {/* Location Grid */}
      <h2 className="text-lg font-semibold text-white mb-4">Locations</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {LOCATIONS
          .filter(loc => locationCounts[loc.id])
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(loc => {
            const count = locationCounts[loc.id] || 0
            return (
              <Link
                key={loc.id}
                to={`/location/${loc.id}`}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:border-brand-300 hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900 group-hover:text-brand-700 transition-colors">{loc.name}</p>
                    <p className="text-sm text-gray-500 mt-1">{loc.type}</p>
                  </div>
                  <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-1 rounded-md">{loc.id}</span>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center">
                      <span className="text-sm font-semibold text-brand-600">{count}</span>
                    </div>
                    <span className="text-sm text-gray-500">staff</span>
                  </div>
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-brand-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            )
          })
        }
      </div>

      {/* Code Legend */}
      <div className="mt-8 bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Attendance Code Reference</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {ATTENDANCE_CODES.map(c => (
            <div key={c.code} className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center rounded text-xs font-bold border px-1.5 py-0.5 min-w-[32px]"
                style={{ backgroundColor: c.hex.bg, color: c.hex.text, borderColor: c.hex.border }}>{c.shortLabel}</span>
              <div>
                <p className="text-xs font-medium text-gray-700">{c.label}</p>
                <p className="text-[10px] text-gray-400">{c.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {lizAdminAccess && (
        <AddEmployeeModal
          open={showAddEmployee}
          onClose={() => setShowAddEmployee(false)}
          onAdded={() => {
            setShowAddEmployee(false)
            refreshDirectory()
          }}
        />
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

function DashboardDrilldown({ id, type, monthName, birthdays, anniversaries, requestedTimeOff, employeeExceptions }) {
  const title = type === 'birthdays'
    ? `${monthName} Birthdays`
    : type === 'anniversaries'
      ? `${monthName} Work Anniversaries`
      : type === 'exceptions'
        ? 'Employees With Exceptions'
        : 'Upcoming Requested Time Off'

  const items = type === 'birthdays' ? birthdays
    : type === 'anniversaries' ? anniversaries
    : type === 'exceptions' ? employeeExceptions
    : requestedTimeOff

  return (
    <section id={id} className="bg-white rounded-xl border border-brand-200 p-5 mb-8" aria-live="polite">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        <span className="text-xs font-medium text-gray-400">{items.length} record{items.length === 1 ? '' : 's'}</span>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-gray-400 py-3">No matching employee records.</p>
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
                  {type === 'anniversaries' && (
                    <>
                      <p className="text-sm font-semibold text-brand-700">{monthName} {item.day}</p>
                      <p className="text-xs text-gray-400">{item.years} year{item.years === 1 ? '' : 's'}</p>
                    </>
                  )}
                  {type === 'time-off' && (
                    <>
                      <p className="text-sm font-semibold text-brand-700">{formatDateKey(item.dateKey)}</p>
                      <p className="text-xs text-gray-400">{CODE_MAP[item.record.code]?.label || item.record.code}</p>
                    </>
                  )}
                  {type === 'exceptions' && (
                    <p className="text-sm font-semibold text-brand-700">{item.count} total</p>
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
