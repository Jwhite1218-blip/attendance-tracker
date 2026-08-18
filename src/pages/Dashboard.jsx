import { Link } from 'react-router-dom'
import { LOCATIONS, LOCATION_MAP } from '../data/locations.js'
import { getLocationCounts, getEmployeesWithEffectiveLocations } from '../data/employeeLocations.js'
import { getEmployeeYearAttendance } from '../data/attendanceStore.js'
import { getAllFlaggedEmployees } from '../data/hrFlags.js'
import { ATTENDANCE_CODES, CODE_MAP } from '../data/attendanceCodes.js'

export default function Dashboard() {
  const employees = getEmployeesWithEffectiveLocations()
  const totalEmployees = employees.length
  const locationCounts = getLocationCounts()

  const flaggedEmployees = getAllFlaggedEmployees()
    .map(flag => ({ ...flag, employee: employees.find(e => (e.kronos_id || e.id) === flag.empId) }))
    .filter(f => f.employee)

  // Load all attendance from localStorage for current year
  const year = new Date().getFullYear()
  let totalMarked = 0
  let totalByCode = {}
  ATTENDANCE_CODES.forEach(c => { if (c.code) totalByCode[c.code] = 0 })

  employees.forEach(emp => {
    const records = getEmployeeYearAttendance(emp.kronos_id || emp.id, year)
    Object.values(records).forEach(r => {
      if (r.code) {
        totalMarked++
        totalByCode[r.code] = (totalByCode[r.code] || 0) + 1
      }
    })
  })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-charcoal-200 mt-1">
          {LOCATIONS.length} locations · {totalEmployees} employees · {year} attendance year
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-500">Locations</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{Object.keys(locationCounts).length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-500">Total Staff</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{totalEmployees}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-500">Days Tracked ({year})</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{totalMarked}</p>
        </div>
      </div>

      {/* HR Attendance Flags */}
      {flaggedEmployees.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200 p-5 mb-8">
          <h2 className="text-sm font-semibold text-red-700 mb-1">🚩 HR Attendance Flags</h2>
          <p className="text-xs text-gray-400 mb-3">
            Automatically flagged after 3 unexcused absences or lates in a school year. Flags are permanent — this is a documented record, not a live status.
          </p>
          <div className="divide-y divide-gray-100">
            {flaggedEmployees.map(f => (
              <div key={f.empId} className="py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-red-600">{f.employee.first_name} {f.employee.last_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {LOCATION_MAP[f.employee.location]?.name || f.employee.location} · {f.employee.position}
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
                  Flagged {new Date(f.flaggedAt).toLocaleDateString()}
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

      {/* Location Grid */}
      <h2 className="text-lg font-semibold text-white mb-4">Locations</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {LOCATIONS
          .filter(loc => locationCounts[loc.id])
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
            <div key={c.code || 'present'} className="flex items-center gap-2">
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
    </div>
  )
}
