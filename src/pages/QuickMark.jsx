import { useState, useMemo, useEffect } from 'react'
import { LOCATIONS, LOCATION_MAP } from '../data/locations.js'
import { getRosterForLocation, getEmployeesWithEffectiveLocations } from '../data/employeeLocations.js'
import { ATTENDANCE_CODES, CODE_MAP, CODE_CYCLE } from '../data/attendanceCodes.js'
import { StatusBadge } from '../components/StatusBadge.jsx'
import TransferModal from '../components/TransferModal.jsx'

export default function QuickMark() {
  const [selectedLocation, setSelectedLocation] = useState('')
  const [roster, setRoster] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [attendance, setAttendance] = useState({})
  const [paintCode, setPaintCode] = useState('U')
  const [showTransfer, setShowTransfer] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  // When location changes, load roster and attendance
  useEffect(() => {
    if (!selectedLocation) {
      setRoster([])
      return
    }
    const r = getRosterForLocation(selectedLocation)
    setRoster(r)
    setCurrentIdx(0)

    // Load attendance for this location + date
    const key = `att-loc-${selectedLocation}-quickmark`
    const saved = localStorage.getItem(key)
    setAttendance(saved ? JSON.parse(saved) : {})
  }, [selectedLocation, refreshKey])

  // Save attendance
  useEffect(() => {
    if (!selectedLocation) return
    localStorage.setItem(`att-loc-${selectedLocation}-quickmark`, JSON.stringify(attendance))
  }, [attendance, selectedLocation])

  const currentEmployee = roster[currentIdx]
  const empKey = currentEmployee?.kronos_id || currentEmployee?.id
  const attKey = `${empKey}-${date}`
  const currentCode = attendance[attKey]?.code || ''

  const handleMark = (code) => {
    if (!currentEmployee) return
    if (code === '') {
      setAttendance(prev => {
        const next = { ...prev }
        delete next[attKey]
        return next
      })
    } else {
      setAttendance(prev => ({
        ...prev,
        [attKey]: { code, date, empId: empKey }
      }))
    }
  }

  const handleCycle = () => {
    const currentIdx = CODE_CYCLE.indexOf(currentCode)
    const nextCode = CODE_CYCLE[(currentIdx + 1) % CODE_CYCLE.length]
    handleMark(nextCode)
  }

  const handleNext = () => {
    if (currentIdx < roster.length - 1) {
      setCurrentIdx(currentIdx + 1)
    }
  }

  const handlePrev = () => {
    if (currentIdx > 0) {
      setCurrentIdx(currentIdx - 1)
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (!currentEmployee) return
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return

      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault()
        handleNext()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        handlePrev()
      } else if (e.key === ' ') {
        e.preventDefault()
        handleCycle()
      } else {
        // Number keys map to codes
        const codes = ATTENDANCE_CODES.filter(c => c.code !== '')
        const num = parseInt(e.key)
        if (num >= 1 && num <= codes.length) {
          handleMark(codes[num - 1].code)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [currentEmployee, currentIdx, attendance, date])

  // Progress
  const markedCount = useMemo(() => {
    return roster.filter(emp => {
      const k = `${emp.kronos_id || emp.id}-${date}`
      return attendance[k]?.code
    }).length
  }, [roster, attendance, date])

  const allEmps = getEmployeesWithEffectiveLocations()
  const locCounts = {}
  allEmps.forEach(e => {
    const loc = e.location || 'Unknown'
    locCounts[loc] = (locCounts[loc] || 0) + 1
  })

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-white mb-1">Quick Mark</h1>
      <p className="text-sm text-charcoal-200 mb-6">
        Pick a school, mark each employee, auto-advance to the next. Keyboard: 1-9 for codes, → or Enter for next, ← for back, Space to cycle.
      </p>

      {/* School dropdown */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Select School</label>
            <select
              value={selectedLocation}
              onChange={e => setSelectedLocation(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 font-medium"
            >
              <option value="">— Choose a school —</option>
              {LOCATIONS
                .filter(l => locCounts[l.id])
                .sort((a, b) => a.sort - b.sort)
                .map(l => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({locCounts[l.id]} staff)
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700"
            />
          </div>
        </div>

        {selectedLocation && roster.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            {/* Progress bar */}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>Progress: {markedCount} of {roster.length} marked</span>
                  <span>{Math.round((markedCount / roster.length) * 100)}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-500 rounded-full transition-all"
                    style={{ width: `${(markedCount / roster.length) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedLocation && roster.length > 0 && currentEmployee ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
          {/* Main marking card */}
          <div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Employee header */}
              <div className="p-3 sm:p-5 bg-gradient-to-r from-brand-50 to-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0">
                      <span className="text-lg font-bold text-white">
                        {currentEmployee.first_name?.[0]}{currentEmployee.last_name?.[0]}
                      </span>
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">
                        {currentEmployee.first_name} {currentEmployee.last_name}
                      </h2>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-gray-500 mt-0.5">
                        <span>ID: {currentEmployee.kronos_id}</span>
                        <span>·</span>
                        <span>{currentEmployee.position}</span>
                        {currentEmployee.isTransferred && (
                          <>
                            <span>·</span>
                            <span className="text-amber-600 font-medium">⚠ Covering from {LOCATION_MAP[currentEmployee.originalLocation]?.name}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Employee</p>
                    <p className="text-2xl font-bold text-brand-600">{currentIdx + 1}<span className="text-gray-300 text-base">/{roster.length}</span></p>
                  </div>
                </div>
              </div>

              {/* Current status */}
              <div className="p-5 border-t border-gray-100">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Current Status — {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                <div className="flex items-center gap-3">
                  {currentCode ? (
                    <StatusBadge code={currentCode} size="large" />
                  ) : (
                    <span className="text-sm text-gray-400 italic">Not yet marked</span>
                  )}
                  {currentCode && (
                    <button
                      onClick={() => handleMark('')}
                      className="text-xs text-gray-400 hover:text-red-500"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Code buttons */}
              <div className="p-5 border-t border-gray-100">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Mark Attendance</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  <button
                    onClick={() => handleMark('')}
                    className="px-2 py-2.5 rounded-lg border-2 text-xs font-bold transition-all"
                    style={currentCode === ''
                      ? { backgroundColor: CODE_MAP[''].hex.bg, color: CODE_MAP[''].hex.text, borderColor: CODE_MAP[''].hex.border, boxShadow: `0 0 0 2px ${CODE_MAP[''].hex.border}` }
                      : { backgroundColor: '#f9fafb', color: '#6b7280', borderColor: '#e5e7eb' }
                    }
                  >
                    <div className="text-base">✓</div>
                    Present
                  </button>
                  {ATTENDANCE_CODES.filter(c => c.code !== '').map((c, idx) => (
                    <button
                      key={c.code}
                      onClick={() => handleMark(c.code)}
                      className={`px-2 py-2.5 rounded-lg border-2 text-xs font-bold transition-all relative ${
                        currentCode === c.code ? 'ring-2 ring-offset-1 scale-105' : 'hover:scale-105'
                      }`}
                      style={{
                        backgroundColor: c.hex.bg,
                        color: c.hex.text,
                        borderColor: c.hex.border,
                        boxShadow: currentCode === c.code ? `0 0 0 2px ${c.hex.border}` : 'none',
                      }}
                    >
                      <div className="text-base font-bold">{c.shortLabel}</div>
                      <div className="text-[9px] font-medium opacity-80">{c.label.split('(')[0].trim()}</div>
                      {idx < 9 && <span className="absolute top-0.5 right-0.5 text-[8px] text-gray-400">{idx + 1}</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Nav buttons */}
              <div className="p-5 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
                <button
                  onClick={handlePrev}
                  disabled={currentIdx === 0}
                  className="px-3 sm:px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ← Previous
                </button>
                <button
                  onClick={() => setShowTransfer(true)}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-amber-600 hover:bg-amber-50 transition-colors"
                >
                  🔄 Transfer
                </button>
                <button
                  onClick={handleNext}
                  disabled={currentIdx === roster.length - 1}
                  className="px-3 sm:px-4 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next →
                </button>
              </div>
            </div>

            {/* Roster strip */}
            <div className="mt-4 bg-white rounded-xl border border-gray-200 p-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">{LOCATION_MAP[selectedLocation]?.name} Roster</p>
              <div className="flex flex-wrap gap-1.5">
                {roster.map((emp, idx) => {
                  const k = `${emp.kronos_id || emp.id}-${date}`
                  const code = attendance[k]?.code
                  return (
                    <button
                      key={emp.id}
                      onClick={() => setCurrentIdx(idx)}
                      className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium border transition-all ${
                        idx === currentIdx
                          ? 'border-brand-400 bg-brand-50 ring-1 ring-brand-200'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-gray-700">{emp.last_name}, {emp.first_name[0]}.</span>
                      {code && (
                        <span
                          className="inline-flex items-center justify-center rounded text-[9px] font-bold px-1 min-w-[20px]"
                          style={{ backgroundColor: CODE_MAP[code]?.hex.bg, color: CODE_MAP[code]?.hex.text }}
                        >
                          {CODE_MAP[code]?.shortLabel}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Sidebar: Code reference */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 sticky top-20">
              <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wide">Code Reference</h3>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center rounded text-xs font-bold border px-1.5 py-1 min-w-[32px]"
                    style={{ backgroundColor: CODE_MAP[''].hex.bg, color: CODE_MAP[''].hex.text, borderColor: CODE_MAP[''].hex.border }}>✓</span>
                  <span className="text-xs text-gray-600">Present</span>
                </div>
                {ATTENDANCE_CODES.filter(c => c.code !== '').map(c => (
                  <div key={c.code} className="flex items-center gap-2">
                    <span
                      className="inline-flex items-center justify-center rounded text-[10px] font-bold border px-1.5 py-1 min-w-[32px]"
                      style={{ backgroundColor: c.hex.bg, color: c.hex.text, borderColor: c.hex.border }}
                    >
                      {c.shortLabel}
                    </span>
                    <span className="text-xs text-gray-600">{c.label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400 space-y-1">
                <p><kbd className="px-1 bg-gray-100 rounded text-[10px]">1-9</kbd> Quick mark codes</p>
                <p><kbd className="px-1 bg-gray-100 rounded text-[10px]">→</kbd> Next employee</p>
                <p><kbd className="px-1 bg-gray-100 rounded text-[10px]">←</kbd> Previous</p>
                <p><kbd className="px-1 bg-gray-100 rounded text-[10px]">Space</kbd> Cycle codes</p>
              </div>
            </div>
          </div>
        </div>
      ) : selectedLocation && roster.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No employees at this location.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-400">↑ Select a school to start marking attendance.</p>
        </div>
      )}

      {showTransfer && currentEmployee && (
        <TransferModal
          employee={currentEmployee}
          onClose={() => setShowTransfer(false)}
          onTransferred={() => setRefreshKey(k => k + 1)}
        />
      )}
    </div>
  )
}
