import { useState, useMemo, useEffect } from 'react'
import { SCHOOLS, generateRoster, getWeekDates, formatDate, STATUS_OPTIONS } from '../data/schools.js'
import StatusBadge from '../components/StatusBadge.jsx'

export default function MasterReport() {
  const [weekOffset, setWeekOffset] = useState(0)
  const [allAttendance, setAllAttendance] = useState({})

  const dates = useMemo(() => getWeekDates(weekOffset), [weekOffset])

  // Load ALL saved attendance from localStorage for all schools
  useEffect(() => {
    const data = {}
    SCHOOLS.forEach(school => {
      const saved = localStorage.getItem(`attendance-${school.id}-${weekOffset}`)
      if (saved) {
        Object.assign(data, JSON.parse(saved))
      }
    })
    setAllAttendance(data)
  }, [weekOffset])

  // Calculate per-school stats
  const schoolStats = useMemo(() => {
    return SCHOOLS.map(school => {
      const roster = generateRoster(school)
      const stats = { present: 0, absent: 0, late: 0, excused: 0, remote: 0, unmarked: 0, total: 0 }
      roster.forEach(emp => {
        dates.forEach(d => {
          const key = `${emp.id}-${d}`
          const status = allAttendance[key]?.status
          stats.total++
          if (status) stats[status]++
          else stats.unmarked++
        })
      })
      const marked = stats.total - stats.unmarked
      stats.presentRate = marked > 0 ? ((stats.present / marked) * 100).toFixed(1) : '—'
      return { school, roster, stats }
    })
  }, [allAttendance, dates])

  // Calculate totals
  const totals = useMemo(() => {
    const t = { present: 0, absent: 0, late: 0, excused: 0, remote: 0, unmarked: 0, total: 0 }
    schoolStats.forEach(s => {
      Object.keys(t).forEach(k => { t[k] += s.stats[k] })
    })
    const marked = t.total - t.unmarked
    t.presentRate = marked > 0 ? ((t.present / marked) * 100).toFixed(1) : '—'
    return t
  }, [schoolStats])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Master Report</h1>
          <p className="text-sm text-gray-500 mt-1">Aggregated attendance across all {SCHOOLS.length} schools</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset(w => w - 1)}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-medium text-gray-700 px-3 py-2">
            Week of {formatDate(dates[0])}
          </span>
          <button
            onClick={() => setWeekOffset(w => w + 1)}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Overall Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        {STATUS_OPTIONS.map(s => (
          <div key={s.value} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <StatusBadge status={s.value} small />
            </div>
            <p className="text-2xl font-bold text-gray-900">{totals[s.value]}</p>
            <p className="text-xs text-gray-500 mt-1">
              {totals.total > 0 ? `${((totals[s.value] / totals.total) * 100).toFixed(1)}% of all records` : '—'}
            </p>
          </div>
        ))}
      </div>

      {/* Overall present rate banner */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-indigo-700">Overall Present Rate</p>
            <p className="text-xs text-indigo-500 mt-1">Across all {SCHOOLS.length} schools, this week</p>
          </div>
          <p className="text-4xl font-bold text-indigo-700">{totals.presentRate}%</p>
        </div>
      </div>

      {/* Per-School Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">School</th>
                <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wide px-2 py-3">Employees</th>
                <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wide px-2 py-3">Records</th>
                {STATUS_OPTIONS.map(s => (
                  <th key={s.value} className="text-center text-xs font-medium text-gray-500 uppercase tracking-wide px-2 py-3">{s.label}</th>
                ))}
                <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wide px-2 py-3">Unmarked</th>
                <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wide px-2 py-3">Present %</th>
              </tr>
            </thead>
            <tbody>
              {schoolStats.map(({ school, stats }, idx) => (
                <tr key={school.id} className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{school.name}</p>
                    <p className="text-xs text-gray-500">{school.code} · {school.location}</p>
                  </td>
                  <td className="text-center text-sm text-gray-700 px-2 py-3">{school.rosterSize}</td>
                  <td className="text-center text-sm text-gray-500 px-2 py-3">{stats.total}</td>
                  {STATUS_OPTIONS.map(s => (
                    <td key={s.value} className="text-center px-2 py-3">
                      <span className={`text-sm font-semibold ${
                        stats[s.value] > 0 ? 'text-gray-900' : 'text-gray-300'
                      }`}>
                        {stats[s.value]}
                      </span>
                    </td>
                  ))}
                  <td className="text-center text-sm text-gray-400 px-2 py-3">{stats.unmarked}</td>
                  <td className="text-center px-2 py-3">
                    <span className={`text-sm font-bold ${
                      stats.presentRate === '—' ? 'text-gray-300' :
                      parseFloat(stats.presentRate) >= 80 ? 'text-present-text' :
                      parseFloat(stats.presentRate) >= 60 ? 'text-late-text' : 'text-absent-text'
                    }`}>
                      {stats.presentRate === '—' ? '—' : `${stats.presentRate}%`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Totals Row */}
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td className="px-4 py-3 text-sm font-bold text-gray-900">TOTALS</td>
                <td className="text-center text-sm font-bold text-gray-900 px-2 py-3">
                  {SCHOOLS.reduce((sum, s) => sum + s.rosterSize, 0)}
                </td>
                <td className="text-center text-sm font-bold text-gray-900 px-2 py-3">{totals.total}</td>
                {STATUS_OPTIONS.map(s => (
                  <td key={s.value} className="text-center text-sm font-bold text-gray-900 px-2 py-3">{totals[s.value]}</td>
                ))}
                <td className="text-center text-sm font-bold text-gray-500 px-2 py-3">{totals.unmarked}</td>
                <td className="text-center text-sm font-bold text-indigo-700 px-2 py-3">
                  {totals.presentRate === '—' ? '—' : `${totals.presentRate}%`}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Data is read from locally saved attendance in your browser. Mark attendance for each school to see it appear here.
      </p>
    </div>
  )
}
