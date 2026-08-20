import { useState, useMemo, useEffect } from 'react'
import { LOCATIONS, LOCATION_MAP } from '../data/locations.js'
import { getRosterForLocation, getEmployeesWithEffectiveLocations } from '../data/employeeLocations.js'
import { ATTENDANCE_CODES, CODE_MAP, CODE_CYCLE } from '../data/attendanceCodes.js'
import { getAttendanceRecord, setAttendanceCode } from '../data/attendanceStore.js'
import { isFlagged } from '../data/hrFlags.js'
import { getDateAvailability } from '../data/blackoutDates.js'
import { StatusBadge } from '../components/StatusBadge.jsx'
import { useAuth } from '../components/PinGate.jsx'
import TransferModal from '../components/TransferModal.jsx'

export default function QuickMark() {
  const { role, locationId: myLocationId, canManageRoster } = useAuth()
  const [selectedLocation, setSelectedLocation] = useState(role === 'school' ? myLocationId : '')
  const [roster, setRoster] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [attendance, setAttendance] = useState({})
  const [noteDraft, setNoteDraft] = useState('')
  const [showTransfer, setShowTransfer] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  // When location changes, load roster
  useEffect(() => {
    if (!selectedLocation) {
      setRoster([])
      return
    }
    const r = getRosterForLocation(selectedLocation)
    setRoster(r)
    setCurrentIdx(0)
  }, [selectedLocation, refreshKey])

  // Load attendance for this roster + date from the shared store
  useEffect(() => {
    const next = {}
    roster.forEach(emp => {
      const key = emp.kronos_id || emp.id
      const record = getAttendanceRecord(key, date)
      if (record) next[`${key}-${date}`] = { ...record, empId: key }
    })
    setAttendance(next)
  }, [roster, date])

  const currentEmployee = roster[currentIdx]
  const empKey = currentEmployee?.kronos_id || currentEmployee?.id
  const attKey = `${empKey}-${date}`
  const currentCode = attendance[attKey]?.code || ''
  const dateAvailability = getDateAvailability(date)

  useEffect(() => {
    setNoteDraft(attendance[attKey]?.note || '')
  }, [attKey, attendance[attKey]?.note])

  const handleMark = (code) => {
    if (!currentEmployee || dateAvailability.unavailable) return
    if (code === 'O' && !noteDraft.trim()) return
    setAttendanceCode(empKey, date, code, code ? noteDraft : '')
    if (code === '') {
      setNoteDraft('')
      setAttendance(prev => {
        const next = { ...prev }
        delete next[attKey]
        return next
      })
    } else {
      setAttendance(prev => ({
        ...prev,
        [attKey]: { code, date, empId: empKey, ...(noteDraft.trim() ? { note: noteDraft.trim() } : {}) }
      }))
    }
  }

  const handleCycle = () => {
    const choices = noteDraft.trim() ? CODE_CYCLE : CODE_CYCLE.filter(code => code !== 'O')
    const currentIdx = choices.indexOf(currentCode)
    const nextCode = choices[(currentIdx + 1) % choices.length]
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
  }, [currentEmployee, currentIdx, attendance, date, noteDraft])

  // Exception count for the selected date
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
        Record attendance exceptions only. Unmarked employees are left alone. Keyboard: 1-9 for codes, → or Enter for next, ← for back, Space to cycle.
      </p>

      {/* School dropdown */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label htmlFor="quick-mark-school" className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">School</label>
            {role === 'school' ? (
              <div className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-700 font-medium">
                {LOCATION_MAP[myLocationId]?.name}
              </div>
            ) : (
              <select
                id="quick-mark-school"
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
            )}
          </div>
          <div>
            <label htmlFor="quick-mark-date" className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Date</label>
            <input
              id="quick-mark-date"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700"
            />
          </div>
        </div>

        {selectedLocation && roster.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-3 text-xs text-gray-500">
            <span>{roster.length} active employees</span>
            <span className="font-semibold text-brand-700">{markedCount} exception{markedCount === 1 ? '' : 's'} recorded</span>
          </div>
        )}
        {dateAvailability.unavailable && (
          <div className={`mt-3 rounded-lg px-3 py-2 text-sm font-semibold ${
            dateAvailability.type === 'blackout'
              ? 'bg-charcoal-800 text-white'
              : 'bg-gray-100 text-gray-500 border border-gray-200'
          }`}>
            {dateAvailability.type === 'blackout' ? `Admin blackout: ${dateAvailability.label}.` : 'Weekend.'} Attendance cannot be marked for this date.
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
                      <h2 className={`text-xl font-bold ${isFlagged(empKey) ? 'text-red-600' : 'text-gray-900'}`}>
                        {currentEmployee.first_name} {currentEmployee.last_name}
                      </h2>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-gray-500 mt-0.5">
                        <span>ID: {currentEmployee.kronos_id}</span>
                        <span>·</span>
                        <span>{currentEmployee.position}</span>
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
                    <span className="text-sm text-gray-400 italic">No attendance exception marked</span>
                  )}
                  {currentCode && (
                    <button
                      onClick={() => handleMark('')}
                      disabled={dateAvailability.unavailable}
                      className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
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
                    disabled={dateAvailability.unavailable}
                    className="px-2 py-2.5 rounded-lg border-2 border-gray-200 bg-gray-50 text-gray-500 text-xs font-bold transition-all hover:border-red-200 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <div className="text-base">×</div>
                    Clear entry
                  </button>
                  {ATTENDANCE_CODES.filter(c => c.code !== '').map((c, idx) => (
                    <button
                      key={c.code}
                      onClick={() => handleMark(c.code)}
                      disabled={dateAvailability.unavailable || (c.code === 'O' && !noteDraft.trim())}
                      title={dateAvailability.unavailable ? dateAvailability.label : c.code === 'O' && !noteDraft.trim() ? 'Add a comment before choosing Other' : c.label}
                      className={`px-2 py-2.5 rounded-lg border-2 text-xs font-bold transition-all relative ${
                        currentCode === c.code ? 'ring-2 ring-offset-1 scale-105' : 'hover:scale-105'
                      } disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed`}
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

                <div className="mt-4 pt-4 border-t border-gray-100">
                  <label htmlFor="quick-mark-note" className="text-xs text-gray-400 uppercase tracking-wide block mb-2">
                    Comment <span className="normal-case">{currentCode === 'O' ? '(required for Other)' : '(optional)'}</span>
                  </label>
                  <textarea
                    id="quick-mark-note"
                    value={noteDraft}
                    onChange={event => setNoteDraft(event.target.value)}
                    disabled={dateAvailability.unavailable}
                    rows={2}
                    placeholder="Add context for this attendance exception…"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 placeholder:text-gray-300 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                  />
                  {currentCode && (
                    <button
                      type="button"
                      onClick={() => handleMark(currentCode)}
                      disabled={dateAvailability.unavailable || (currentCode === 'O' && !noteDraft.trim())}
                      className="mt-2 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 disabled:opacity-40"
                    >
                      Save comment
                    </button>
                  )}
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
                {role === 'admin' && canManageRoster && (
                  <button
                    onClick={() => setShowTransfer(true)}
                    className="px-3 py-2 rounded-lg text-sm font-medium text-amber-600 hover:bg-amber-50 transition-colors"
                  >
                    🔄 Transfer
                  </button>
                )}
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
                  const empId = emp.kronos_id || emp.id
                  const k = `${empId}-${date}`
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
                      <span className={isFlagged(empId) ? 'text-red-600 font-semibold' : 'text-gray-700'}>{emp.last_name}, {emp.first_name[0]}.</span>
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

      {role === 'admin' && canManageRoster && showTransfer && currentEmployee && (
        <TransferModal
          employee={currentEmployee}
          onClose={() => setShowTransfer(false)}
          onTransferred={() => setRefreshKey(k => k + 1)}
        />
      )}
    </div>
  )
}
