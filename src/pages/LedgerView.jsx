import { useState, useMemo, useEffect } from 'react'
import employees from '../data/employees.json'
import { LOCATION_MAP } from '../data/locations.js'
import { ATTENDANCE_CODES, CODE_MAP, CODE_CYCLE } from '../data/attendanceCodes.js'

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
  const [search, setSearch] = useState('')
  const [locationFilter, setLocationFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(employees[0]?.id)
  const [startYear, setStartYear] = useState(new Date().getFullYear())
  const [attendanceByYear, setAttendanceByYear] = useState({})

  const employee = useMemo(() => employees.find(e => e.id === selectedId), [selectedId])
  const empKey = employee?.kronos_id || employee?.id
  const years = [startYear, startYear + 1]

  // Load attendance for both visible years
  useEffect(() => {
    if (!empKey) return
    const data = {}
    years.forEach(y => {
      const saved = localStorage.getItem(`att-emp-${empKey}-${y}`)
      data[y] = saved ? JSON.parse(saved) : {}
    })
    setAttendanceByYear(data)
  }, [empKey, startYear])

  const filteredEmployees = useMemo(() => {
    return employees.filter(e => {
      const matchesSearch = search === '' ||
        `${e.first_name} ${e.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
        (e.kronos_id || '').includes(search)
      const matchesLoc = locationFilter === 'all' || e.location === locationFilter
      return matchesSearch && matchesLoc
    })
  }, [search, locationFilter])

  const handleCellClick = (year, monthIdx, day) => {
    const dateKey = formatDateKey(year, monthIdx, day)
    const current = attendanceByYear[year]?.[dateKey]?.code ?? ''
    const currentIdx = CODE_CYCLE.indexOf(current)
    const nextCode = CODE_CYCLE[(currentIdx + 1) % CODE_CYCLE.length]

    setAttendanceByYear(prev => {
      const yearData = { ...(prev[year] || {}) }
      if (nextCode === '') {
        delete yearData[dateKey]
      } else {
        yearData[dateKey] = { code: nextCode, date: dateKey }
      }
      const updated = { ...prev, [year]: yearData }
      localStorage.setItem(`att-emp-${empKey}-${year}`, JSON.stringify(yearData))
      return updated
    })
  }

  // Year summary counts (across both visible years)
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
    return <div className="max-w-7xl mx-auto px-4 py-8 text-gray-500">No employee selected.</div>
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Ledger View</h1>
        <p className="text-sm text-gray-500 mt-1">
          Classic sheet-style attendance ledger — one employee, full year(s), all codes at a glance.
        </p>
      </div>

      {/* Employee picker */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search employee by name or ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
            />
          </div>
          <select
            value={locationFilter}
            onChange={e => setLocationFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700"
          >
            <option value="all">All Locations</option>
            {Object.values(LOCATION_MAP)
              .filter(l => employees.some(e => e.location === l.id))
              .sort((a, b) => a.sort - b.sort)
              .map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
          </select>
          <select
            value={selectedId}
            onChange={e => setSelectedId(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 min-w-[220px]"
          >
            {filteredEmployees.map(e => (
              <option key={e.id} value={e.id}>
                {e.last_name}, {e.first_name} — {LOCATION_MAP[e.location]?.shortName || e.location || 'Unassigned'}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* Main ledger */}
        <div>
          {/* Employee info header — mirrors the old paper format */}
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
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">DOH</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{employee.hire_date || '—'}</p>
              </div>
              <div className="p-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Weekly Hours</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{employee.weekly_hours ? `${employee.weekly_hours} hrs` : '—'}</p>
              </div>
            </div>
            <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-gray-500">{LOCATION_MAP[employee.location]?.name || 'Unassigned location'}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStartYear(y => y - 1)}
                  className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-100 text-gray-600"
                >
                  ← Prev Year
                </button>
                <span className="text-xs font-medium text-gray-500">{startYear} – {startYear + 1}</span>
                <button
                  onClick={() => setStartYear(y => y + 1)}
                  className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-100 text-gray-600"
                >
                  Next Year →
                </button>
              </div>
            </div>
          </div>

          {/* Ledger grid — one block per year */}
          {years.map(year => (
            <div key={year} className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
              <div className="bg-indigo-600 text-white text-sm font-bold px-3 py-2">{year}</div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="sticky left-0 bg-gray-50 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide px-2 py-1.5 border-b border-gray-200" style={{ minWidth: '64px' }}>
                        Month
                      </th>
                      {Array.from({ length: 31 }).map((_, i) => (
                        <th key={i} className="text-center text-[10px] font-medium text-gray-400 px-0 py-1.5 border-b border-l border-gray-100" style={{ minWidth: '30px' }}>
                          {i + 1}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MONTHS.map((monthName, monthIdx) => {
                      const numDays = daysInMonth(year, monthIdx)
                      return (
                        <tr key={monthIdx} className="hover:bg-indigo-50/30">
                          <td className="sticky left-0 bg-white text-xs font-semibold text-gray-700 px-2 py-1 border-b border-gray-100" style={{ minWidth: '64px' }}>
                            {monthName}
                          </td>
                          {Array.from({ length: 31 }).map((_, i) => {
                            const day = i + 1
                            if (day > numDays) {
                              return <td key={i} className="bg-gray-50 border-b border-l border-gray-100" />
                            }
                            const dateKey = formatDateKey(year, monthIdx, day)
                            const code = attendanceByYear[year]?.[dateKey]?.code || ''
                            const info = CODE_MAP[code]
                            return (
                              <td key={i} className="border-b border-l border-gray-100 p-0">
                                <button
                                  onClick={() => handleCellClick(year, monthIdx, day)}
                                  className="w-full h-7 flex items-center justify-center text-[9px] font-bold hover:ring-1 hover:ring-inset hover:ring-indigo-300 transition-all"
                                  style={code ? {
                                    backgroundColor: info?.hex.bg,
                                    color: info?.hex.text,
                                  } : {}}
                                  title={`${monthName} ${day}, ${year} — ${info?.label || 'Present'}`}
                                >
                                  {code || ''}
                                </button>
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

          <p className="text-xs text-gray-400">
            Click any day cell to cycle through codes. Data is shared with the Year Calendar view on the employee's detail page.
          </p>
        </div>

        {/* Key sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 sticky top-20">
            <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wide">Key</h3>
            <div className="space-y-1.5">
              {ATTENDANCE_CODES.filter(c => c.code !== '').map(c => (
                <div key={c.code} className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center justify-center rounded text-[10px] font-bold border px-1.5 py-1 min-w-[40px]"
                    style={{ backgroundColor: c.hex.bg, color: c.hex.text, borderColor: c.hex.border }}
                  >
                    {c.shortLabel}
                  </span>
                  <span className="text-xs text-gray-600">{c.label}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                {startYear}–{startYear + 1} Totals
              </h4>
              <div className="space-y-1">
                {ATTENDANCE_CODES.filter(c => c.code && summary[c.code] > 0).map(c => (
                  <div key={c.code} className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">{c.shortLabel}</span>
                    <span className="font-semibold text-gray-800">{summary[c.code]}</span>
                  </div>
                ))}
                {Object.values(summary).every(v => v === 0) && (
                  <p className="text-xs text-gray-400">No records marked yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
