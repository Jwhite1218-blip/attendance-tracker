import { useState, useMemo, useEffect } from 'react'
import employees from '../data/employees.json'
import { LOCATIONS, LOCATION_MAP } from '../data/locations.js'
import { ATTENDANCE_CODES, CODE_MAP, CODE_CYCLE } from '../data/attendanceCodes.js'
import { getEmployeesWithEffectiveLocations } from '../data/employeeLocations.js'
import { getEmployeeYearAttendance, setAttendanceCode } from '../data/attendanceStore.js'
import { useAuth } from '../components/PinGate.jsx'
import TransferModal from '../components/TransferModal.jsx'

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'April', 'May', 'June',
  'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'
]

function daysInMonth(year, monthIdx) {
  return new Date(year, monthIdx + 1, 0).getDate()
}

function formatDateKey(year, monthIdx, day) {
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export default function LedgerView() {
  const { role, locationId: myLocationId } = useAuth()
  const [search, setSearch] = useState('')
  const [selectedLocation, setSelectedLocation] = useState(role === 'school' ? myLocationId : '')
  const [selectedId, setSelectedId] = useState(null)
  const [startYear, setStartYear] = useState(new Date().getFullYear())
  const [attendanceByYear, setAttendanceByYear] = useState({})
  const [showTransfer, setShowTransfer] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  // Get employees with effective locations (including transfers)
  const allEmployees = useMemo(() => getEmployeesWithEffectiveLocations(), [refreshKey])

  // Build school dropdown options with counts
  const schoolOptions = useMemo(() => {
    const counts = {}
    allEmployees.forEach(e => {
      const loc = e.location || ''
      if (loc) counts[loc] = (counts[loc] || 0) + 1
    })
    return LOCATIONS
      .filter(l => counts[l.id])
      .sort((a, b) => a.sort - b.sort)
      .map(l => ({ ...l, count: counts[l.id] }))
  }, [allEmployees])

  // Filtered employees based on school selection + search
  const filteredEmployees = useMemo(() => {
    let list = allEmployees
    if (selectedLocation) {
      list = list.filter(e => e.location === selectedLocation)
    }
    if (search) {
      list = list.filter(e =>
        `${e.first_name} ${e.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
        (e.kronos_id || '').includes(search)
      )
    }
    return list
  }, [allEmployees, selectedLocation, search])

  // Auto-select first employee if none selected
  useEffect(() => {
    if (!selectedId && filteredEmployees.length > 0) {
      setSelectedId(filteredEmployees[0].id)
    }
    if (selectedId && !filteredEmployees.find(e => e.id === selectedId)) {
      setSelectedId(filteredEmployees[0]?.id || null)
    }
  }, [filteredEmployees, selectedId])

  const employee = useMemo(() => allEmployees.find(e => e.id === selectedId), [allEmployees, selectedId])
  const empKey = employee?.kronos_id || employee?.id
  const years = [startYear, startYear + 1]

  useEffect(() => {
    if (!empKey) return
    const data = {}
    years.forEach(y => {
      data[y] = getEmployeeYearAttendance(empKey, y)
    })
    setAttendanceByYear(data)
  }, [empKey, startYear])

  const handleCellClick = (year, monthIdx, day) => {
    const dateKey = formatDateKey(year, monthIdx, day)
    const current = attendanceByYear[year]?.[dateKey]?.code ?? ''
    const currentIdx = CODE_CYCLE.indexOf(current)
    const nextCode = CODE_CYCLE[(currentIdx + 1) % CODE_CYCLE.length]

    const yearData = setAttendanceCode(empKey, dateKey, nextCode)
    setAttendanceByYear(prev => ({ ...prev, [year]: yearData }))
  }

  const summary = useMemo(() => {
    const stats = {}
    ATTENDANCE_CODES.forEach(c => { if (c.code) stats[c.code] = 0 })
    years.forEach(y => {
      Object.values(attendanceByYear[y] || {}).forEach(r => {
        if (r.code) stats[r.code] = (stats[r.code] || 0) + 1
      })
    })
    return stats
  }, [attendanceByYear, startYear])

  if (!employee) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 text-charcoal-200">
        Select a school and employee to view their attendance ledger.
      </div>
    )
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Ledger View</h1>
        <p className="text-sm text-charcoal-200 mt-1">
          Classic sheet-style attendance ledger — pick a school, pick an employee, mark their year.
        </p>
      </div>

      {/* School + Employee picker */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3">
          {/* School dropdown */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">School</label>
            {role === 'school' ? (
              <div className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-700 font-medium">
                {LOCATION_MAP[myLocationId]?.name}
              </div>
            ) : (
              <select
                value={selectedLocation}
                onChange={e => { setSelectedLocation(e.target.value); setSelectedId(null); }}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 font-medium"
              >
                <option value="">All Schools</option>
                {schoolOptions.map(l => (
                  <option key={l.id} value={l.id}>{l.name} ({l.count})</option>
                ))}
              </select>
            )}
          </div>

          {/* Employee dropdown */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Employee</label>
            <select
              value={selectedId || ''}
              onChange={e => setSelectedId(Number(e.target.value))}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700"
            >
              {filteredEmployees.map(e => (
                <option key={e.id} value={e.id}>
                  {e.last_name}, {e.first_name} — {LOCATION_MAP[e.location]?.shortName || e.location || 'Unassigned'}
                </option>
              ))}
            </select>
          </div>

          {/* Transfer button */}
          {role === 'admin' && (
            <div className="flex items-end">
              <button
                onClick={() => setShowTransfer(true)}
                className="px-3 py-2 rounded-lg text-sm font-medium text-amber-600 border border-amber-200 hover:bg-amber-50 transition-colors whitespace-nowrap"
              >
                🔄 Transfer
              </button>
            </div>
          )}
        </div>

        {/* Search bar */}
        <div className="mt-3">
          <input
            type="text"
            placeholder={role === 'school' ? 'Search by name or ID...' : 'Search by name or ID (works across all schools)...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* Main ledger */}
        <div>
          {/* Employee info header */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-gray-100">
              <div className="p-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Name</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{employee.first_name} {employee.last_name}</p>
              </div>
              <div className="p-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Personnel #</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{employee.kronos_id}</p>
              </div>
              <div className="p-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Job Title</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{employee.position}</p>
              </div>
              <div className="p-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Assigned To</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">
                  {LOCATION_MAP[employee.location]?.name || employee.location || 'Unassigned'}
                </p>
              </div>
              <div className="p-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Weekly Hours</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{employee.weekly_hours ? `${employee.weekly_hours} hrs` : '—'}</p>
              </div>
            </div>
            <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                DOH: {employee.hire_date || '—'} · Service: {employee.service_date || '—'}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setStartYear(y => y - 1)} className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-100 text-gray-600">← Prev</button>
                <span className="text-xs font-medium text-gray-500">{startYear}–{startYear + 1}</span>
                <button onClick={() => setStartYear(y => y + 1)} className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-100 text-gray-600">Next →</button>
              </div>
            </div>
          </div>

          {/* Ledger grids */}
          {years.map(year => (
            <div key={year} className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
              <div className="bg-brand-600 text-white text-sm font-bold px-3 py-2">{year}</div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="sticky left-0 bg-gray-50 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide px-2 py-1.5 border-b border-gray-200" style={{ minWidth: '64px' }}>Month</th>
                      {Array.from({ length: 31 }).map((_, i) => (
                        <th key={i} className="text-center text-[10px] font-medium text-gray-400 px-0 py-1.5 border-b border-l border-gray-100" style={{ minWidth: '30px' }}>{i + 1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MONTHS.map((monthName, monthIdx) => {
                      const numDays = daysInMonth(year, monthIdx)
                      return (
                        <tr key={monthIdx} className="hover:bg-brand-50/30">
                          <td className="sticky left-0 bg-white text-xs font-semibold text-gray-700 px-2 py-1 border-b border-gray-100" style={{ minWidth: '64px' }}>{monthName}</td>
                          {Array.from({ length: 31 }).map((_, i) => {
                            const day = i + 1
                            if (day > numDays) return <td key={i} className="bg-gray-50 border-b border-l border-gray-100" />
                            const dateKey = formatDateKey(year, monthIdx, day)
                            const code = attendanceByYear[year]?.[dateKey]?.code || ''
                            const info = CODE_MAP[code]
                            return (
                              <td key={i} className="border-b border-l border-gray-100 p-0">
                                <button
                                  onClick={() => handleCellClick(year, monthIdx, day)}
                                  className="w-full h-7 flex items-center justify-center text-[9px] font-bold hover:ring-1 hover:ring-inset hover:ring-brand-300 transition-all"
                                  style={code ? { backgroundColor: info?.hex.bg, color: info?.hex.text } : {}}
                                  title={`${monthName} ${day}, ${year} — ${info?.label || 'Present'}`}
                                >{code || ''}</button>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <p className="text-xs text-charcoal-300">Click any day cell to cycle through codes. Data is shared with the Year Calendar view.</p>
        </div>

        {/* Key sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 sticky top-20">
            <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wide">Key</h3>
            <div className="space-y-1.5">
              {ATTENDANCE_CODES.filter(c => c.code !== '').map(c => (
                <div key={c.code} className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center rounded text-[10px] font-bold border px-1.5 py-1 min-w-[40px]"
                    style={{ backgroundColor: c.hex.bg, color: c.hex.text, borderColor: c.hex.border }}>{c.shortLabel}</span>
                  <span className="text-xs text-gray-600">{c.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{startYear}–{startYear + 1} Totals</h4>
              <div className="space-y-1">
                {ATTENDANCE_CODES.filter(c => c.code && summary[c.code] > 0).map(c => (
                  <div key={c.code} className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">{c.shortLabel}</span>
                    <span className="font-semibold text-gray-800">{summary[c.code]}</span>
                  </div>
                ))}
                {Object.values(summary).every(v => v === 0) && <p className="text-xs text-gray-400">No records marked yet.</p>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {role === 'admin' && showTransfer && employee && (
        <TransferModal
          employee={employee}
          onClose={() => setShowTransfer(false)}
          onTransferred={() => setRefreshKey(k => k + 1)}
        />
      )}
    </div>
  )
}
