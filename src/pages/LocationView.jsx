import { useState, useMemo, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { LOCATIONS, LOCATION_MAP } from '../data/locations.js'
import { getRosterForLocation } from '../data/employeeLocations.js'
import { ATTENDANCE_CODES, CODE_MAP, CODE_CYCLE } from '../data/attendanceCodes.js'
import { StatusBadge } from '../components/StatusBadge.jsx'
import EmployeeDetail from './EmployeeDetail.jsx'
import TransferModal from '../components/TransferModal.jsx'

function getWeekDates(weekOffset = 0) {
  const today = new Date()
  const monday = new Date(today)
  monday.setDate(today.getDate() - today.getDay() + 1 + weekOffset * 7)
  const dates = []
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    dates.push(d.toISOString().split('T')[0])
  }
  return dates
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function LocationView() {
  const { id } = useParams()
  const location = LOCATION_MAP[id]
  const [weekOffset, setWeekOffset] = useState(0)
  const [attendance, setAttendance] = useState({})
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [selectedCode, setSelectedCode] = useState('U')
  const [paintMode, setPaintMode] = useState(false)
  const [isPainting, setIsPainting] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const dates = useMemo(() => getWeekDates(weekOffset), [weekOffset])
  const roster = useMemo(() => getRosterForLocation(id), [id, refreshKey])

  const locKey = `${id}-${weekOffset}`

  useEffect(() => {
    const saved = localStorage.getItem(`att-loc-${locKey}`)
    if (saved) {
      setAttendance(JSON.parse(saved))
    } else {
      setAttendance({})
    }
  }, [locKey])

  useEffect(() => {
    localStorage.setItem(`att-loc-${locKey}`, JSON.stringify(attendance))
  }, [attendance, locKey])

  if (!location) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p className="text-charcoal-200">Location not found.</p>
        <Link to="/" className="text-brand-300 hover:underline mt-2 inline-block">Back to Dashboard</Link>
      </div>
    )
  }

  if (selectedEmployee) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-2 text-sm text-charcoal-200 mb-6">
          <Link to="/" className="hover:text-brand-300">Dashboard</Link>
          <span>/</span>
          <Link to={`/location/${id}`} className="hover:text-brand-300" onClick={() => setSelectedEmployee(null)}>
            {location.name}
          </Link>
          <span>/</span>
          <span className="text-white font-medium">{selectedEmployee.first_name} {selectedEmployee.last_name}</span>
        </div>
        <EmployeeDetail employee={selectedEmployee} />
        <div className="mt-6">
          <button onClick={() => setSelectedEmployee(null)} className="text-sm text-brand-300 hover:underline">
            ← Back to {location.name} roster
          </button>
        </div>
      </div>
    )
  }

  const handleToggle = (empId, date) => {
    const key = `${empId}-${date}`
    if (paintMode) {
      setAttendance(prev => ({ ...prev, [key]: { code: selectedCode, date, empId } }))
      return
    }
    const current = attendance[key]?.code ?? ''
    const currentIdx = CODE_CYCLE.indexOf(current)
    const nextCode = CODE_CYCLE[(currentIdx + 1) % CODE_CYCLE.length]
    if (nextCode === '') {
      setAttendance(prev => { const next = { ...prev }; delete next[key]; return next })
    } else {
      setAttendance(prev => ({ ...prev, [key]: { code: nextCode, date, empId } }))
    }
  }

  const handleSetAll = (date, code) => {
    setAttendance(prev => {
      const updated = { ...prev }
      roster.forEach(emp => {
        const key = `${emp.kronos_id || emp.id}-${date}`
        if (code === '') { delete updated[key] } else { updated[key] = { code, date, empId: emp.kronos_id || emp.id } }
      })
      return updated
    })
  }

  const weekStats = useMemo(() => {
    const stats = { total: 0, marked: 0 }
    ATTENDANCE_CODES.forEach(c => { if (c.code) stats[c.code] = 0 })
    roster.forEach(emp => {
      dates.forEach(d => {
        stats.total++
        const key = `${emp.kronos_id || emp.id}-${d}`
        const code = attendance[key]?.code
        if (code) { stats[code] = (stats[code] || 0) + 1; stats.marked++ }
      })
    })
    return stats
  }, [attendance, roster, dates])

  const transferredHere = roster.filter(e => e.isTransferred)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" onMouseLeave={() => setIsPainting(false)}>
      <div className="flex items-center gap-2 text-sm text-charcoal-200 mb-4">
        <Link to="/" className="hover:text-brand-300">Dashboard</Link>
        <span>/</span>
        <span className="text-white font-medium">{location.name}</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{location.name}</h1>
          <p className="text-sm text-charcoal-200 mt-1">
            {location.type} · {roster.length} staff · {location.id}
            {transferredHere.length > 0 && (
              <span className="text-amber-600 ml-2">· {transferredHere.length} covering from other schools</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekOffset(w => w - 1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="text-sm font-medium text-gray-700 px-3 py-2">Week of {formatDate(dates[0])}</span>
          <button onClick={() => setWeekOffset(w => w + 1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>

      {/* Transferred employees banner */}
      {transferredHere.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-amber-700 font-medium">⚠ Staff covering from other schools:</p>
          <div className="flex flex-wrap gap-2 mt-1">
            {transferredHere.map(e => (
              <span key={e.id} className="text-xs bg-white border border-amber-200 rounded px-2 py-1">
                {e.first_name} {e.last_name} ← {LOCATION_MAP[e.originalLocation]?.name || e.originalLocation}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Marked</span>
          <span className="text-sm font-semibold text-gray-700">{weekStats.marked}/{weekStats.total}</span>
        </div>
        {ATTENDANCE_CODES.filter(c => c.code && weekStats[c.code] > 0).map(c => (
          <div key={c.code} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
            <span className="inline-flex items-center justify-center rounded text-[10px] font-bold border px-1 py-0.5 min-w-[24px]"
              style={{ backgroundColor: c.hex.bg, color: c.hex.text, borderColor: c.hex.border }}>{c.shortLabel}</span>
            <span className="text-sm font-semibold text-gray-700">{weekStats[c.code]}</span>
          </div>
        ))}
      </div>

      {/* Paint Mode Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4 bg-white border border-gray-200 rounded-xl p-3">
        <button onClick={() => setPaintMode(!paintMode)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${paintMode ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          {paintMode ? '🎨 Paint ON' : '🎨 Paint Mode'}
        </button>
        {paintMode && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {ATTENDANCE_CODES.filter(c => c.code !== '').map(c => (
              <button key={c.code} onClick={() => setSelectedCode(c.code)}
                className={`px-2 py-1 rounded text-xs font-semibold border transition-all ${selectedCode === c.code ? 'ring-2 ring-offset-1 ring-brand-400 scale-105' : ''}`}
                style={{ backgroundColor: c.hex.bg, color: c.hex.text, borderColor: c.hex.border }} title={c.label}>
                {c.shortLabel}
              </button>
            ))}
          </div>
        )}
        <span className="text-xs text-gray-400 ml-auto">{paintMode ? 'Click or drag to mark' : 'Click cells to cycle codes · Click name for full history'}</span>
      </div>

      {/* Attendance Grid */}
      <div className="overflow-x-auto">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="sticky left-0 bg-gray-50 z-10 text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3" style={{ minWidth: '220px' }}>Employee</th>
                {dates.map(d => (
                  <th key={d} className="text-center px-2 py-3" style={{ minWidth: '90px' }}>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{formatDate(d)}</div>
                    <button onClick={() => handleSetAll(d, '')} className="mt-1 text-[10px] text-gray-400 hover:text-brand-500">Clear All</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roster.map((emp, idx) => (
                <tr key={emp.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}>
                  <td className={`sticky left-0 z-10 px-4 py-3 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                    <button onClick={() => setSelectedEmployee(emp)} className="flex items-center gap-3 text-left group w-full">
                      <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-brand-600">{emp.first_name?.[0]}{emp.last_name?.[0]}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 group-hover:text-brand-700 transition-colors truncate flex items-center gap-1">
                          {emp.first_name} {emp.last_name}
                          {emp.isTransferred && <span className="text-amber-500 text-[10px]" title={`Covering from ${LOCATION_MAP[emp.originalLocation]?.name}`}>⚠</span>}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{emp.position}</p>
                      </div>
                      <svg className="w-4 h-4 text-gray-300 group-hover:text-brand-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </td>
                  {dates.map(d => {
                    const key = `${emp.kronos_id || emp.id}-${d}`
                    const code = attendance[key]?.code || ''
                    const info = CODE_MAP[code]
                    return (
                      <td key={d} className="text-center px-2 py-3">
                        <button
                          onClick={() => handleToggle(emp.kronos_id || emp.id, d)}
                          onMouseDown={() => paintMode && setIsPainting(true)}
                          onMouseUp={() => setIsPainting(false)}
                          onMouseEnter={() => { if (paintMode && isPainting) handleToggle(emp.kronos_id || emp.id, d) }}
                          className="w-full flex justify-center"
                        >
                          {code ? <StatusBadge code={code} size="small" /> : (
                            <span className="inline-flex items-center justify-center rounded border border-dashed border-gray-200 text-xs text-gray-300 hover:border-brand-300 hover:text-brand-400 transition-colors w-[28px] h-[22px]">·</span>
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

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-charcoal-300">Click a cell to cycle through codes. Click an employee name to see their full year calendar & history.</p>
        <button onClick={() => setShowTransfer(true)} className="text-xs text-amber-600 hover:text-amber-700 font-medium">
          🔄 Transfer an employee to another school
        </button>
      </div>

      {showTransfer && roster[0] && (
        <TransferModal
          employee={roster[0]}
          onClose={() => setShowTransfer(false)}
          onTransferred={() => setRefreshKey(k => k + 1)}
        />
      )}
    </div>
  )
}
