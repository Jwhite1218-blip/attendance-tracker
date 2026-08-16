import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { SCHOOLS, generateRoster, getWeekDates, formatDate, STATUS_CYCLE, STATUS_OPTIONS } from '../data/schools.js'
import StatusBadge from '../components/StatusBadge.jsx'

export default function SchoolView() {
  const { id } = useParams()
  const school = SCHOOLS.find(s => s.id === parseInt(id))
  const [weekOffset, setWeekOffset] = useState(0)
  const [attendance, setAttendance] = useState({})

  const dates = useMemo(() => getWeekDates(weekOffset), [weekOffset])
  const roster = useMemo(() => school ? generateRoster(school) : [], [school])

  // Load any saved attendance from localStorage
  useEffect(() => {
    if (!school) return
    const saved = localStorage.getItem(`attendance-${school.id}-${weekOffset}`)
    if (saved) {
      setAttendance(JSON.parse(saved))
    } else {
      setAttendance({})
    }
  }, [school, weekOffset])

  // Save attendance to localStorage
  useEffect(() => {
    if (!school) return
    localStorage.setItem(`attendance-${school.id}-${weekOffset}`, JSON.stringify(attendance))
  }, [attendance, school, weekOffset])

  if (!school) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p className="text-gray-500">School not found.</p>
        <Link to="/" className="text-indigo-600 hover:underline mt-2 inline-block">Back to Dashboard</Link>
      </div>
    )
  }

  const handleToggle = (employeeId, date) => {
    const key = `${employeeId}-${date}`
    const current = attendance[key]?.status
    let nextStatus
    if (!current) {
      nextStatus = STATUS_CYCLE[0]
    } else {
      const idx = STATUS_CYCLE.indexOf(current)
      nextStatus = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    }
    setAttendance(prev => ({
      ...prev,
      [key]: { status: nextStatus, date, employeeId }
    }))
  }

  const handleSetAll = (date, status) => {
    setAttendance(prev => {
      const updated = { ...prev }
      roster.forEach(emp => {
        updated[`${emp.id}-${date}`] = { status, date, employeeId: emp.id }
      })
      return updated
    })
  }

  // Count stats for current week
  const weekStats = useMemo(() => {
    const stats = { present: 0, absent: 0, late: 0, excused: 0, remote: 0, unmarked: 0 }
    roster.forEach(emp => {
      dates.forEach(d => {
        const key = `${emp.id}-${d}`
        const status = attendance[key]?.status
        if (status) stats[status]++
        else stats.unmarked++
      })
    })
    return stats
  }, [attendance, roster, dates])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link to="/" className="hover:text-indigo-600">Dashboard</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{school.name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{school.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {school.location} · {roster.length} employees · Code: {school.code}
          </p>
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

      {/* Quick Stats */}
      <div className="flex flex-wrap gap-3 mb-6">
        {STATUS_OPTIONS.map(s => (
          <div key={s.value} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
            <StatusBadge status={s.value} small />
            <span className="text-sm font-semibold text-gray-900">{weekStats[s.value]}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Unmarked</span>
          <span className="text-sm font-semibold text-gray-600">{weekStats.unmarked}</span>
        </div>
      </div>

      {/* Quick Fill Buttons per Day */}
      <div className="overflow-x-auto">
        <table className="w-full">
          {/* Quick fill row */}
          <thead>
            <tr>
              <th className="sticky left-0 bg-gray-50 z-10 text-left text-xs font-medium text-gray-500 uppercase tracking-wide pb-2 pl-1" style={{ minWidth: '200px' }}>
                Quick Fill
              </th>
              {dates.map(d => (
                <th key={d} className="text-center pb-2 px-1">
                  <button
                    onClick={() => handleSetAll(d, 'present')}
                    className="text-xs bg-present-bg text-present-text border border-present-border rounded px-2 py-1 hover:opacity-80 transition-opacity w-full"
                    title="Mark all Present"
                  >
                    All Present
                  </button>
                </th>
              ))}
            </tr>
          </thead>
        </table>

        {/* Attendance Grid */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="sticky left-0 bg-gray-50 z-10 text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3" style={{ minWidth: '200px' }}>
                  Employee
                </th>
                {dates.map(d => (
                  <th key={d} className="text-center text-xs font-medium text-gray-500 uppercase tracking-wide px-2 py-3" style={{ minWidth: '120px' }}>
                    {formatDate(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roster.map((emp, idx) => (
                <tr key={emp.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className={`sticky left-0 z-10 px-4 py-3 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-indigo-600">
                          {emp.firstName[0]}{emp.lastName[0]}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{emp.firstName} {emp.lastName}</p>
                        <p className="text-xs text-gray-500">{emp.role}</p>
                      </div>
                    </div>
                  </td>
                  {dates.map(d => {
                    const key = `${emp.id}-${d}`
                    const status = attendance[key]?.status
                    return (
                      <td key={d} className="text-center px-2 py-3">
                        <button
                          onClick={() => handleToggle(emp.id, d)}
                          className="w-full"
                        >
                          {status ? (
                            <StatusBadge status={status} />
                          ) : (
                            <span className="inline-block w-full py-1.5 rounded-md border border-dashed border-gray-200 text-xs text-gray-400 hover:border-indigo-300 hover:text-indigo-400 transition-colors">
                              —
                            </span>
                          )}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Click any cell to cycle through attendance statuses. Data is saved locally in your browser.
      </p>
    </div>
  )
}
