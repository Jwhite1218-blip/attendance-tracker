import { useState, useMemo, useEffect } from 'react'
import { LOCATIONS, LOCATION_MAP } from '../data/locations.js'
import { getEmployeesWithEffectiveLocations } from '../data/employeeLocations.js'
import { ATTENDANCE_CODES, CODE_MAP } from '../data/attendanceCodes.js'
import { StatusBadge } from '../components/StatusBadge.jsx'

export default function MasterReport() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [allAttendance, setAllAttendance] = useState({})
  const [filterLocation, setFilterLocation] = useState('all')

  const employees = useMemo(() => getEmployeesWithEffectiveLocations(), [])

  useEffect(() => {
    const data = {}
    employees.forEach(emp => {
      const key = `att-emp-${emp.kronos_id || emp.id}-${year}`
      const saved = localStorage.getItem(key)
      if (saved) {
        try {
          const records = JSON.parse(saved)
          Object.entries(records).forEach(([dateKey, record]) => {
            data[`${emp.kronos_id || emp.id}-${dateKey}`] = record
          })
        } catch {}
      }
    })
    setAllAttendance(data)
  }, [year, employees])

  const locationStats = useMemo(() => {
    const filteredLocs = filterLocation === 'all'
      ? LOCATIONS.filter(l => employees.some(e => e.location === l.id))
      : LOCATIONS.filter(l => l.id === filterLocation)

    return filteredLocs.map(loc => {
      const roster = employees.filter(e => e.location === loc.id)
      const stats = { total: roster.length, marked: 0 }
      ATTENDANCE_CODES.forEach(c => { if (c.code) stats[c.code] = 0 })

      roster.forEach(emp => {
        const empId = emp.kronos_id || emp.id
        Object.entries(allAttendance).forEach(([key, record]) => {
          if (key.startsWith(`${empId}-`) && record.code) {
            stats[record.code] = (stats[record.code] || 0) + 1
            stats.marked++
          }
        })
      })

      return { location: loc, roster, stats }
    })
  }, [allAttendance, filterLocation, year, employees])

  const totals = useMemo(() => {
    const t = { total: 0, marked: 0 }
    ATTENDANCE_CODES.forEach(c => { if (c.code) t[c.code] = 0 })
    locationStats.forEach(({ stats }) => {
      t.total += stats.total
      t.marked += stats.marked
      ATTENDANCE_CODES.forEach(c => { if (c.code) t[c.code] += stats[c.code] || 0 })
    })
    return t
  }, [locationStats])

  const topAbsentees = useMemo(() => {
    const empStats = employees.map(emp => {
      const empId = emp.kronos_id || emp.id
      let marked = 0
      let unexcused = 0
      Object.entries(allAttendance).forEach(([key, record]) => {
        if (key.startsWith(`${empId}-`) && record.code) {
          marked++
          const info = CODE_MAP[record.code]
          if (info && (info.code === 'U' || info.code === 'NCNS' || info.code === 'CC')) unexcused++
        }
      })
      return { employee: emp, marked, unexcused }
    })
    return empStats.filter(e => e.unexcused > 0).sort((a, b) => b.unexcused - a.unexcused).slice(0, 10)
  }, [allAttendance, employees])

  const allCodes = ATTENDANCE_CODES.filter(c => c.code !== '')

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Master Report</h1>
          <p className="text-sm text-charcoal-200 mt-1">Aggregated attendance across all {LOCATIONS.length} locations</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setYear(y => y - 1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className="text-sm font-bold text-gray-900 min-w-[50px] text-center">{year}</span>
            <button onClick={() => setYear(y => y + 1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
          <select value={filterLocation} onChange={e => setFilterLocation(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700">
            <option value="all">All Locations</option>
            {LOCATIONS.filter(l => employees.some(e => e.location === l.id)).map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Total Staff</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totals.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Records Marked</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totals.marked}</p>
        </div>
        {allCodes.slice(0, 4).map(c => (
          <div key={c.code} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="inline-flex items-center justify-center rounded text-[10px] font-bold border px-1 py-0.5 min-w-[24px]"
                style={{ backgroundColor: c.hex.bg, color: c.hex.text, borderColor: c.hex.border }}>{c.shortLabel}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{totals[c.code] || 0}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3 sticky left-0 bg-gray-50">Location</th>
                <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wide px-2 py-3">Staff</th>
                <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wide px-2 py-3">Marked</th>
                {allCodes.map(c => (
                  <th key={c.code} className="text-center text-xs font-medium text-gray-500 uppercase tracking-wide px-2 py-3" title={c.label}>{c.shortLabel}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {locationStats.map(({ location: loc, stats }, idx) => (
                <tr key={loc.id} className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                  <td className="px-4 py-3 sticky left-0" style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <p className="text-sm font-medium text-gray-900">{loc.name}</p>
                    <p className="text-xs text-gray-500">{loc.type}</p>
                  </td>
                  <td className="text-center text-sm text-gray-700 px-2 py-3">{stats.total}</td>
                  <td className="text-center text-sm text-gray-500 px-2 py-3">{stats.marked}</td>
                  {allCodes.map(c => (
                    <td key={c.code} className="text-center px-2 py-3">
                      <span className={`text-sm font-semibold ${stats[c.code] > 0 ? 'text-gray-900' : 'text-gray-300'}`}>{stats[c.code] || 0}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {filterLocation === 'all' && (
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td className="px-4 py-3 text-sm font-bold text-gray-900 sticky left-0 bg-gray-50">TOTALS</td>
                  <td className="text-center text-sm font-bold text-gray-900 px-2 py-3">{totals.total}</td>
                  <td className="text-center text-sm font-bold text-gray-900 px-2 py-3">{totals.marked}</td>
                  {allCodes.map(c => (
                    <td key={c.code} className="text-center text-sm font-bold text-gray-900 px-2 py-3">{totals[c.code] || 0}</td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {topAbsentees.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Top Unexcused Absences — {year}</h2>
            <p className="text-xs text-gray-400 mt-1">Employees with the most U, NCNS, or CC codes this year</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-2">Employee</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-2 py-2">Location</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-2 py-2">Position</th>
                  <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wide px-2 py-2">Unexcused</th>
                  <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wide px-2 py-2">Total Marked</th>
                </tr>
              </thead>
              <tbody>
                {topAbsentees.map((e, idx) => (
                  <tr key={e.employee.id} className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                    <td className="px-4 py-2"><span className="text-sm font-medium text-gray-900">{e.employee.first_name} {e.employee.last_name}</span></td>
                    <td className="px-2 py-2"><span className="text-sm text-gray-600">{LOCATION_MAP[e.employee.location]?.name || e.employee.location}</span></td>
                    <td className="px-2 py-2"><span className="text-sm text-gray-500">{e.employee.position}</span></td>
                    <td className="text-center px-2 py-2"><span className="text-sm font-bold text-red-600">{e.unexcused}</span></td>
                    <td className="text-center px-2 py-2"><span className="text-sm text-gray-500">{e.marked}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Code Reference</h2>
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
