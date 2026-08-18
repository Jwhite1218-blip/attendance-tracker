import { useState, useMemo, useEffect } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { LOCATIONS, LOCATION_MAP } from '../data/locations.js'
import { getRosterForLocation } from '../data/employeeLocations.js'
import { ATTENDANCE_CODES, CODE_MAP, CODE_CYCLE } from '../data/attendanceCodes.js'
import { getAttendanceCode, setAttendanceCode } from '../data/attendanceStore.js'
import { isFlagged } from '../data/hrFlags.js'
import { StatusBadge, StatusBadgeLarge } from '../components/StatusBadge.jsx'
import { useAuth } from '../components/PinGate.jsx'
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

function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDate()
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' })
  return { weekday, day }
}

export default function LocationView() {
  const { id: urlId } = useParams()
  const { role, locationId: myLocationId } = useAuth()
  // School-role sessions are always locked to their own school, regardless of URL
  const id = role === 'school' ? myLocationId : urlId
  const location = LOCATION_MAP[id]
  const [weekOffset, setWeekOffset] = useState(0)
  const [attendance, setAttendance] = useState({})
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [selectedCode, setSelectedCode] = useState('U')
  const [paintMode, setPaintMode] = useState(false)
  const [isPainting, setIsPainting] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [picker, setPicker] = useState(null)

  const dates = useMemo(() => getWeekDates(weekOffset), [weekOffset])
  const roster = useMemo(() => getRosterForLocation(id), [id, refreshKey])

  // Load this week's attendance for the roster from the shared store
  useEffect(() => {
    const next = {}
    roster.forEach(emp => {
      const empId = emp.kronos_id || emp.id
      dates.forEach(d => {
        const code = getAttendanceCode(empId, d)
        if (code) next[`${empId}-${d}`] = { code, date: d, empId }
      })
    })
    setAttendance(next)
  }, [roster, dates])

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

  // Normalize the URL if a school-role session typed/followed a link to another school
  if (role === 'school' && urlId !== myLocationId) {
    return <Navigate to={`/location/${myLocationId}`} replace />
  }

  if (!location) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p className="text-charcoal-200">Location not found.</p>
        <Link to="/" className="text-brand-300 hover:underline mt-2 inline-block">Back to Dashboard</Link>
      </div>
    )
  }

  // ─── EMPLOYEE DETAIL VIEW ───
  if (selectedEmployee) {
    return (
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* Sticky back bar - always visible, easy to reach on mobile */}
        <div className="sticky top-16 z-40 -mx-3 sm:-mx-6 lg:-mx-8 px-3 sm:px-6 lg:px-8 py-2 mb-4 bg-charcoal-700/95 backdrop-blur-sm border-b border-charcoal-600 flex items-center justify-between gap-2">
          <button
            onClick={() => setSelectedEmployee(null)}
            className="flex items-center gap-2 text-sm font-medium text-brand-300 hover:text-brand-200 transition-colors py-1.5 px-3 rounded-lg hover:bg-charcoal-600"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline">Back to {location.name}</span>
            <span className="sm:hidden">Back</span>
          </button>
          <div className="flex items-center gap-2 text-xs text-charcoal-200 truncate">
            <Link to="/" className="hover:text-brand-300 hidden sm:inline">Dashboard</Link>
            <span className="hidden sm:inline">/</span>
            <span className="truncate">{selectedEmployee.first_name} {selectedEmployee.last_name}</span>
          </div>
        </div>

        <EmployeeDetail employee={selectedEmployee} />
      </div>
    )
  }

  // ─── LOCATION ROSTER VIEW ───
  const handleToggle = (empId, date) => {
    const key = `${empId}-${date}`
    if (paintMode) {
      setAttendanceCode(empId, date, selectedCode)
      setAttendance(prev => ({ ...prev, [key]: { code: selectedCode, date, empId } }))
      return
    }
    const current = attendance[key]?.code ?? ''
    const currentIdx = CODE_CYCLE.indexOf(current)
    const nextCode = CODE_CYCLE[(currentIdx + 1) % CODE_CYCLE.length]
    setAttendanceCode(empId, date, nextCode)
    if (nextCode === '') {
      setAttendance(prev => { const next = { ...prev }; delete next[key]; return next })
    } else {
      setAttendance(prev => ({ ...prev, [key]: { code: nextCode, date, empId } }))
    }
  }

  const handleSetCode = (empId, date, code) => {
    const key = `${empId}-${date}`
    setAttendanceCode(empId, date, code)
    if (code === '') {
      setAttendance(prev => { const next = { ...prev }; delete next[key]; return next })
    } else {
      setAttendance(prev => ({ ...prev, [key]: { code, date, empId } }))
    }
  }

  const handleSetAll = (date, code) => {
    roster.forEach(emp => setAttendanceCode(emp.kronos_id || emp.id, date, code))
    setAttendance(prev => {
      const updated = { ...prev }
      roster.forEach(emp => {
        const key = `${emp.kronos_id || emp.id}-${date}`
        if (code === '') { delete updated[key] } else { updated[key] = { code, date, empId: emp.kronos_id || emp.id } }
      })
      return updated
    })
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8" onMouseLeave={() => setIsPainting(false)}>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs sm:text-sm text-charcoal-200 mb-3 sm:mb-4">
        <Link to="/" className="hover:text-brand-300">Dashboard</Link>
        <span>/</span>
        <span className="text-white font-medium truncate">{location.name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">{location.name}</h1>
          <p className="text-xs sm:text-sm text-charcoal-200 mt-1">
            {location.type} · {roster.length} staff · {location.id}
          </p>
        </div>
        {/* Week navigation */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button onClick={() => setWeekOffset(w => w - 1)} className="p-2 rounded-lg border border-charcoal-600 hover:bg-charcoal-600 text-charcoal-200">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="text-xs sm:text-sm font-medium text-charcoal-100 px-2 sm:px-3 py-2 whitespace-nowrap">Week of {formatDate(dates[0])}</span>
          <button onClick={() => setWeekOffset(w => w + 1)} className="p-2 rounded-lg border border-charcoal-600 hover:bg-charcoal-600 text-charcoal-200">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>

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
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4 bg-white border border-gray-200 rounded-xl p-3">
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
        <span className="text-xs text-gray-400 ml-auto hidden sm:inline">{paintMode ? 'Click or drag to mark' : 'Click cells to cycle · Click name for full history'}</span>
      </div>

      {/* ─── MOBILE: Card-based layout ─── */}
      <div className="md:hidden space-y-3">
        {roster.map((emp, idx) => {
          const empAtt = dates.map(d => {
            const key = `${emp.kronos_id || emp.id}-${d}`
            return { date: d, code: attendance[key]?.code || '' }
          })

          return (
            <div key={emp.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Employee header - tap to open detail */}
              <button
                onClick={() => setSelectedEmployee(emp)}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-semibold text-brand-600">{emp.first_name?.[0]}{emp.last_name?.[0]}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium flex items-center gap-1 ${isFlagged(emp.kronos_id || emp.id) ? 'text-red-600' : 'text-gray-900'}`}>
                    {emp.first_name} {emp.last_name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{emp.position}</p>
                </div>
                <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {/* Day cells - horizontal row */}
              <div className="grid grid-cols-5 gap-px bg-gray-100 border-t border-gray-100">
                {empAtt.map(({ date, code }) => {
                  const { weekday, day } = formatDateShort(date)
                  return (
                    <button
                      key={date}
                      onClick={() => {
                        if (paintMode) {
                          handleToggle(emp.kronos_id || emp.id, date)
                        } else {
                          setPicker({ empId: emp.kronos_id || emp.id, date, empName: `${emp.first_name} ${emp.last_name}` })
                        }
                      }}
                      className="bg-white p-2 flex flex-col items-center gap-1 active:bg-gray-50 transition-colors"
                    >
                      <span className="text-[10px] text-gray-400 uppercase">{weekday[0]}</span>
                      <span className="text-[10px] text-gray-500 font-medium">{day}</span>
                      {code ? (
                        <StatusBadge code={code} size="small" />
                      ) : (
                        <span className="inline-flex items-center justify-center rounded border border-dashed border-gray-200 text-xs text-gray-300 w-[28px] h-[22px]">·</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* ─── DESKTOP: Table layout ─── */}
      <div className="hidden md:block overflow-x-auto">
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
                        <p className={`text-sm font-medium transition-colors truncate flex items-center gap-1 ${isFlagged(emp.kronos_id || emp.id) ? 'text-red-600' : 'text-gray-900 group-hover:text-brand-700'}`}>
                          {emp.first_name} {emp.last_name}
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

      {/* Footer actions */}
      <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <p className="text-xs text-charcoal-300">Tap a day to mark attendance. Tap a name for full year calendar.</p>
        {role === 'admin' && (
          <button onClick={() => setShowTransfer(true)} className="text-xs text-amber-600 hover:text-amber-700 font-medium">
            🔄 Transfer an employee to another school
          </button>
        )}
      </div>

      {role === 'admin' && showTransfer && roster[0] && (
        <TransferModal
          employee={roster[0]}
          onClose={() => setShowTransfer(false)}
          onTransferred={() => setRefreshKey(k => k + 1)}
        />
      )}

      {picker && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPicker(null)} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-sm max-h-[75vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
              <div>
                <p className="text-sm font-bold text-gray-900">{picker.empName}</p>
                <p className="text-xs text-gray-500">{formatDate(picker.date)}</p>
              </div>
              <button onClick={() => setPicker(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-2">
              {ATTENDANCE_CODES.map(c => (
                <button
                  key={c.code || 'present'}
                  onClick={() => { handleSetCode(picker.empId, picker.date, c.code); setPicker(null) }}
                  className="w-full flex items-center px-2 py-2 rounded-lg hover:bg-gray-50 active:bg-gray-100 text-left transition-colors"
                >
                  <StatusBadgeLarge code={c.code} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
