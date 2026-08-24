import { useState, useMemo, useEffect } from 'react'
import { ATTENDANCE_CODES, CODE_MAP } from '../data/attendanceCodes.js'
import { getEmployeeYearAttendance, replaceAttendanceYearSnapshot, setAttendanceCode } from '../data/attendanceStore.js'
import { getAttendanceStageLabel, getEmployeeAttendanceStatus, isFlagged } from '../data/hrFlags.js'
import { getEmployeeByKey, saveEmployeeNotes, setEmployeeActive } from '../data/employeeLocations.js'
import { getDateAvailability } from '../data/blackoutDates.js'
import { getCalendarYearMonths, getFiscalYearMonths, formatYearLabel, readCalendarMode, writeCalendarMode } from '../data/fiscalCalendar.js'
import { useAuth } from '../components/PinGate.jsx'
import AttendancePickerModal from '../components/AttendancePickerModal.jsx'
import EmployeeEditForm from '../components/EmployeeEditForm.jsx'
import { formatBirthday } from '../data/employeeFields.js'
import { hasLizAdminAccess } from '../data/futureTools.js'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstWeekday(year, month) {
  return new Date(year, month, 1).getDay()
}

function formatDateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function getMonthStats(attendance, year, monthIdx) {
  const s = {}
  ATTENDANCE_CODES.forEach(c => { if (c.code) s[c.code] = 0 })
  const prefix = formatDateKey(year, monthIdx, '')
  Object.entries(attendance).forEach(([key, record]) => {
    if (key.startsWith(prefix) && record.code) {
      s[record.code] = (s[record.code] || 0) + 1
    }
  })
  return s
}

export default function EmployeeDetail({ employee, onStatusChange, onEmployeeUpdate }) {
  const access = useAuth()
  const { canEditAttendance, dataVersion } = access
  const lizAdminAccess = hasLizAdminAccess(access)
  const [year, setYear] = useState(new Date().getFullYear())
  const [mode, setMode] = useState(readCalendarMode)
  const [attendance, setAttendance] = useState({})
  const [selectedCode, setSelectedCode] = useState('UNEX')
  const [paintMode, setPaintMode] = useState(false)
  const [isPainting, setIsPainting] = useState(false)
  const [picker, setPicker] = useState(null)
  const [notesDraft, setNotesDraft] = useState(employee?.notes || '')
  const [inactiveReason, setInactiveReason] = useState('')
  const [notesSaved, setNotesSaved] = useState(false)
  const [confirmInactive, setConfirmInactive] = useState(false)
  const [showEditEmployee, setShowEditEmployee] = useState(false)
  const [visibleMonths, setVisibleMonths] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return new Set([new Date().getMonth()])
    }
    return null
  })

  const empKey = employee?.kronos_id || employee?.id
  const attendanceStatus = getEmployeeAttendanceStatus(empKey)

  const setCalendarMode = nextMode => {
    setMode(nextMode)
    writeCalendarMode(nextMode)
  }

  const displayMonths = mode === 'fiscal' ? getFiscalYearMonths(year) : getCalendarYearMonths(year)

  useEffect(() => {
    if (!empKey) return
    // A school year (Jul-Jun) spans two calendar-year blobs — load and merge both so the
    // fiscal grid has data for every displayed month, not just the ones in `year` itself.
    const primary = getEmployeeYearAttendance(empKey, year)
    if (mode === 'fiscal') {
      setAttendance({ ...primary, ...getEmployeeYearAttendance(empKey, year + 1) })
    } else {
      setAttendance(primary)
    }
  }, [empKey, year, mode, dataVersion])

  useEffect(() => {
    const currentEmployee = getEmployeeByKey(empKey)
    setNotesDraft(currentEmployee?.notes || '')
    setInactiveReason(currentEmployee?.inactive_reason || '')
    setNotesSaved(false)
    setConfirmInactive(false)
    setShowEditEmployee(false)
  }, [empKey, employee?.notes, employee?.inactive_reason])

  const applyYearSnapshot = (dateKey, yearData) => {
    const changedYear = Number(dateKey.slice(0, 4))
    setAttendance(current => replaceAttendanceYearSnapshot(current, changedYear, yearData))
  }

  const handleDayClick = (dateKey) => {
    if (!canEditAttendance || getDateAvailability(dateKey).unavailable) return
    if (paintMode) {
      applyYearSnapshot(dateKey, setAttendanceCode(empKey, dateKey, selectedCode))
    } else {
      const date = new Date(`${dateKey}T00:00:00`)
      setPicker({
        empId: empKey,
        date: dateKey,
        formattedDate: date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
        empName: `${employee?.first_name || ''} ${employee?.last_name || ''}`.trim(),
        code: attendance[dateKey]?.code || '',
        note: attendance[dateKey]?.note || '',
      })
    }
  }

  const handleDayMouseEnter = (dateKey) => {
    if (canEditAttendance && paintMode && isPainting && !getDateAvailability(dateKey).unavailable) {
      applyYearSnapshot(dateKey, setAttendanceCode(empKey, dateKey, selectedCode))
    }
  }

  const yearStats = useMemo(() => {
    const stats = {}
    ATTENDANCE_CODES.forEach(c => {
      if (c.code !== '') stats[c.code] = 0
    })
    stats.totalMarked = 0

    Object.values(attendance).forEach(record => {
      if (record.code && record.code !== '') {
        stats[record.code] = (stats[record.code] || 0) + 1
        stats.totalMarked++
      }
    })

    return stats
  }, [attendance])

  // Pre-compute stats for every displayed month (no hooks inside .map). Keyed by "year-monthIdx"
  // since a fiscal-year display spans two calendar years, unlike a plain 12-month calendar year.
  const monthStatsByKey = useMemo(() => {
    const map = {}
    displayMonths.forEach(({ year: monthYear, monthIdx }) => {
      map[`${monthYear}-${monthIdx}`] = getMonthStats(attendance, monthYear, monthIdx)
    })
    return map
  }, [attendance, displayMonths])

  const today = new Date()

  const serviceDate = employee?.service_date
  const hireDate = employee?.hire_date
  const birthdate = employee?.birthdate
  const tShirtSize = employee?.t_shirt_size
  const yearsOfService = serviceDate
    ? Math.floor((new Date() - new Date(serviceDate)) / (1000 * 60 * 60 * 24 * 365))
    : null

  const isMonthVisible = (monthIdx) => {
    if (visibleMonths === null) return true
    return visibleMonths.has(monthIdx)
  }

  const showAllMonths = () => setVisibleMonths(null)
  const showCurrentMonthOnly = () => setVisibleMonths(new Set([new Date().getMonth()]))

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Employee Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
              <span className="text-base sm:text-lg font-bold text-brand-600">
                {(employee?.first_name?.[0] || '')}{(employee?.last_name?.[0] || '')}
              </span>
            </div>
            <div className="min-w-0">
              <h2 className={`text-lg sm:text-xl font-bold ${isFlagged(empKey) ? 'text-red-600' : 'text-gray-900'}`}>
                {employee?.first_name} {employee?.last_name}
              </h2>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs sm:text-sm text-gray-500">
                <span>ID: {employee?.kronos_id}</span>
                <span>{employee?.position}</span>
                {employee?.location && <span>{employee?.location}</span>}
                {yearsOfService != null && <span>{yearsOfService} yrs service</span>}
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${employee?.active === false ? 'bg-gray-100 text-gray-500' : 'bg-emerald-50 text-emerald-700'}`}>
                  {employee?.active === false ? 'Inactive' : 'Active'} employee
                </span>
                {attendanceStatus && (
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${isFlagged(empKey) ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                    {getAttendanceStageLabel(attendanceStatus)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-start sm:items-end gap-2 self-start sm:self-auto">
            <div className="flex items-center gap-2">
              {lizAdminAccess && (
                <button
                  type="button"
                  onClick={() => setShowEditEmployee(value => !value)}
                  className="px-3 py-2 rounded-lg border border-brand-200 bg-brand-50 text-brand-700 text-xs font-semibold hover:bg-brand-100"
                >
                  {showEditEmployee ? 'Close edit' : 'Edit employee'}
                </button>
              )}
              <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setCalendarMode('calendar')}
                  className={`px-2 py-1.5 ${mode === 'calendar' ? 'bg-brand-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  Calendar Year
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarMode('fiscal')}
                  className={`px-2 py-1.5 ${mode === 'fiscal' ? 'bg-brand-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  School Year
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setYear(y => y - 1)}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-base sm:text-lg font-bold text-gray-900 min-w-[50px] text-center">{formatYearLabel(year, mode)}</span>
              <button
                onClick={() => setYear(y => y + 1)}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-100">
          {hireDate && (
            <div>
              <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide">Hire Date</p>
              <p className="text-xs sm:text-sm font-medium text-gray-700 mt-0.5">{hireDate}</p>
            </div>
          )}
          {serviceDate && (
            <div>
              <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide">Service Date</p>
              <p className="text-xs sm:text-sm font-medium text-gray-700 mt-0.5">{serviceDate}</p>
            </div>
          )}
          <div>
            <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide">Birthdate</p>
            <p className="text-xs sm:text-sm font-medium text-gray-700 mt-0.5">{formatBirthday(birthdate)}</p>
          </div>
          {lizAdminAccess && (
            <div>
              <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide">T-shirt Size</p>
              <p className="text-xs sm:text-sm font-medium text-gray-700 mt-0.5">{tShirtSize || '—'}</p>
            </div>
          )}
        </div>
      </div>

      {lizAdminAccess && showEditEmployee && (
        <EmployeeEditForm
          employee={employee}
          onCancel={() => setShowEditEmployee(false)}
          onSaved={savedEmployee => {
            onEmployeeUpdate?.(savedEmployee)
            setShowEditEmployee(false)
          }}
        />
      )}

      {lizAdminAccess && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row gap-5">
            <div className="flex-1">
              <label htmlFor="employee-admin-notes" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Employee notes
              </label>
              <p className="text-[11px] text-gray-400 mt-1">Administrative notes are saved with this shared employee record.</p>
              <textarea
                id="employee-admin-notes"
                value={notesDraft}
                onChange={event => {
                  setNotesDraft(event.target.value)
                  setNotesSaved(false)
                }}
                rows={3}
                placeholder="Add an employee note…"
                className="mt-2 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 placeholder:text-gray-300 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    saveEmployeeNotes(empKey, notesDraft)
                    setNotesSaved(true)
                  }}
                  className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700"
                >
                  Save notes
                </button>
                {notesSaved && <span className="text-xs font-medium text-emerald-600">Saved</span>}
              </div>
            </div>

            <div className="lg:w-80 lg:border-l lg:border-gray-100 lg:pl-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Employee status</p>
              <p className="text-[11px] text-gray-400 mt-1">Inactive employees leave active rosters without losing their history.</p>
              <input
                type="text"
                value={inactiveReason}
                onChange={event => setInactiveReason(event.target.value)}
                placeholder="Reason (optional)"
                className="mt-2 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 placeholder:text-gray-300 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
              {confirmInactive ? (
                <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-xs font-semibold text-red-700">Move {employee?.first_name} to inactive employees?</p>
                  <p className="text-[11px] text-red-600 mt-1">Their attendance history and notes will be kept.</p>
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEmployeeActive(empKey, false, inactiveReason)
                        onStatusChange?.()
                      }}
                      className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
                    >
                      Confirm inactive
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmInactive(false)}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 text-xs font-semibold hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmInactive(true)}
                  className="mt-2 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100"
                >
                  Move to inactive
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toolbar: Paint mode + Code legend */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {canEditAttendance ? <button
              onClick={() => setPaintMode(!paintMode)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${
                paintMode
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {paintMode ? '🎨 Paint ON' : '🎨 Paint Mode'}
            </button> : <span className="text-sm font-semibold text-gray-600">Read-only employee history</span>}
            {canEditAttendance && paintMode && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {ATTENDANCE_CODES.filter(c => c.code !== '').map(c => (
                  <button
                    key={c.code}
                    onClick={() => setSelectedCode(c.code)}
                    className={`px-2 py-1 rounded text-xs font-semibold border transition-all ${
                      selectedCode === c.code ? 'ring-2 ring-offset-1 ring-brand-400 scale-105' : ''
                    }`}
                    style={{
                      backgroundColor: c.hex.bg,
                      color: c.hex.text,
                      borderColor: c.hex.border,
                    }}
                    title={c.label}
                  >
                    {c.shortLabel}
                  </button>
                ))}
              </div>
            )}
          </div>

          {canEditAttendance && !paintMode && (
            <p className="text-xs text-gray-400">
              Select any day to choose an attendance exception and add a comment. Use Paint Mode to mark multiple days.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-3 pt-3 border-t border-gray-100">
          {ATTENDANCE_CODES.map(c => (
            <div
              key={c.code}
              className="flex items-center gap-1.5"
            >
              <span
                className="inline-flex items-center justify-center rounded text-[10px] font-bold border px-1 py-0.5 min-w-[24px]"
                style={{ backgroundColor: c.hex.bg, color: c.hex.text, borderColor: c.hex.border }}
              >
                {c.shortLabel}
              </span>
              <span className="text-xs text-gray-500">{c.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Year Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-2 sm:p-3">
          <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide">Exceptions</p>
          <p className="text-lg sm:text-xl font-bold text-gray-900 mt-1">{yearStats.totalMarked}</p>
        </div>
        {ATTENDANCE_CODES.filter(c => c.code !== '' && yearStats[c.code] > 0).slice(0, 5).map(c => (
          <div key={c.code} className="bg-white rounded-xl border border-gray-200 p-2 sm:p-3">
            <p className="text-[10px] sm:text-xs uppercase tracking-wide" style={{ color: c.hex.text }}>{c.shortLabel}</p>
            <p className="text-lg sm:text-xl font-bold mt-1" style={{ color: c.hex.text }}>{yearStats[c.code]}</p>
          </div>
        ))}
      </div>

      {mode === 'fiscal' && (
        <div className="md:hidden flex items-center gap-2 flex-wrap">
          <button
            onClick={showCurrentMonthOnly}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${visibleMonths !== null ? 'bg-brand-600 text-white border-brand-600' : 'bg-white border-gray-200 text-gray-600'}`}
          >
            Current Month
          </button>
          <button
            onClick={showAllMonths}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${visibleMonths === null ? 'bg-brand-600 text-white border-brand-600' : 'bg-white border-gray-200 text-gray-600'}`}
          >
            Show All 12
          </button>
        </div>
      )}

      {mode === 'calendar' ? (
        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden" onMouseLeave={() => setIsPainting(false)} aria-labelledby="calendar-ledger-heading">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h3 id="calendar-ledger-heading" className="text-sm font-semibold text-gray-900">Calendar-year ledger</h3>
            <p className="text-xs text-gray-400 mt-0.5">January through December in one attendance sheet. Unmarked days have no stored attendance exception.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="sticky left-0 z-10 bg-gray-50 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide px-3 py-2 border-b border-gray-200 min-w-24">Month</th>
                  {Array.from({ length: 31 }).map((_, index) => (
                    <th key={index} className="text-center text-[10px] font-medium text-gray-400 px-0 py-2 border-b border-l border-gray-100 min-w-10">{index + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MONTHS.map((monthName, monthIdx) => {
                  const numberOfDays = getDaysInMonth(year, monthIdx)
                  return (
                    <tr key={monthName} className="hover:bg-brand-50/30">
                      <td className="sticky left-0 z-10 bg-white text-xs font-semibold text-gray-700 px-3 py-1.5 border-b border-gray-100">{monthName}</td>
                      {Array.from({ length: 31 }).map((_, index) => {
                        const day = index + 1
                        if (day > numberOfDays) return <td key={day} className="bg-gray-50 border-b border-l border-gray-100" />

                        const dateKey = formatDateKey(year, monthIdx, day)
                        const record = attendance[dateKey]
                        const code = record?.code || ''
                        const info = CODE_MAP[code]
                        const availability = getDateAvailability(dateKey)
                        const isUnavailable = availability.unavailable
                        return (
                          <td
                            key={day}
                            className={`border-b border-l p-0 ${
                              availability.type === 'blackout'
                                ? 'bg-charcoal-800 border-charcoal-700'
                                : availability.type === 'weekend'
                                  ? 'bg-gray-100 border-gray-200'
                                  : 'border-gray-100'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => handleDayClick(dateKey)}
                              onMouseDown={() => canEditAttendance && paintMode && !isUnavailable && setIsPainting(true)}
                              onMouseUp={() => setIsPainting(false)}
                              onMouseEnter={() => handleDayMouseEnter(dateKey)}
                              disabled={!canEditAttendance || isUnavailable}
                              className={`relative w-full min-w-10 h-9 flex items-center justify-center text-[9px] font-bold transition-all ${
                                availability.type === 'blackout'
                                  ? 'text-white cursor-not-allowed'
                                  : availability.type === 'weekend'
                                    ? 'text-gray-300 cursor-not-allowed'
                                    : canEditAttendance ? 'hover:ring-1 hover:ring-inset hover:ring-brand-300' : 'cursor-default'
                              }`}
                              style={!isUnavailable && code ? {
                                backgroundColor: info?.hex.bg,
                                color: info?.hex.text,
                              } : {}}
                              title={!canEditAttendance
                                ? `${monthName} ${day}, ${year} — Read-only access`
                                : isUnavailable
                                  ? `${monthName} ${day}, ${year} — ${availability.label}`
                                  : info
                                    ? `${monthName} ${day}, ${year} — ${info.label}${record?.note ? ` — ${record.note}` : ''}`
                                    : `${monthName} ${day}, ${year} — No attendance exception`}
                            >
                              {availability.type === 'blackout' ? '×' : availability.type === 'weekend' ? '—' : info?.shortLabel || ''}
                              {!isUnavailable && record?.note && (
                                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-white/90 ring-1 ring-black/10" aria-label="Comment added" />
                              )}
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
        </section>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4" onMouseLeave={() => setIsPainting(false)}>
          {displayMonths.map(({ year: monthYear, monthIdx }) => {
            if (!isMonthVisible(monthIdx)) return null

            const monthName = MONTHS[monthIdx]
            const numberOfDays = getDaysInMonth(monthYear, monthIdx)
            const firstWeekday = getFirstWeekday(monthYear, monthIdx)
            const monthStats = monthStatsByKey[`${monthYear}-${monthIdx}`] || {}

            return (
              <div key={`${monthYear}-${monthIdx}`} className="bg-white rounded-xl border border-gray-200 p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-900">{monthName} {monthYear}</h3>
                  <div className="flex gap-1">
                    {ATTENDANCE_CODES.filter(codeInfo => codeInfo.code && monthStats[codeInfo.code] > 0).map(codeInfo => (
                      <span
                        key={codeInfo.code}
                        className="inline-flex items-center justify-center rounded text-[9px] font-bold border px-1"
                        style={{ backgroundColor: codeInfo.hex.bg, color: codeInfo.hex.text, borderColor: codeInfo.hex.border }}
                        title={`${codeInfo.label}: ${monthStats[codeInfo.code]}`}
                      >
                        {codeInfo.shortLabel}{monthStats[codeInfo.code]}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-0.5 mb-1">
                  {WEEKDAYS.map((weekday, index) => (
                    <div key={`${weekday}-${index}`} className="text-center text-[9px] font-medium text-gray-400">{weekday}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {Array.from({ length: firstWeekday }).map((_, index) => <div key={`empty-${index}`} />)}
                  {Array.from({ length: numberOfDays }).map((_, dayIndex) => {
                    const day = dayIndex + 1
                    const dateKey = formatDateKey(monthYear, monthIdx, day)
                    const record = attendance[dateKey]
                    const code = record?.code || ''
                    const info = CODE_MAP[code]
                    const availability = getDateAvailability(dateKey)
                    const isUnavailable = availability.unavailable

                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => handleDayClick(dateKey)}
                        onMouseDown={() => canEditAttendance && paintMode && !isUnavailable && setIsPainting(true)}
                        onMouseUp={() => setIsPainting(false)}
                        onMouseEnter={() => handleDayMouseEnter(dateKey)}
                        disabled={!canEditAttendance || isUnavailable}
                        className={`
                          relative aspect-square rounded text-[10px] font-medium
                          flex items-center justify-center transition-all
                          ${isUnavailable ? 'border' : code ? 'border' : 'border border-gray-100'}
                          ${availability.type === 'blackout' ? 'bg-charcoal-800 text-white border-charcoal-800' : ''}
                          ${availability.type === 'weekend' ? 'bg-gray-100 text-gray-300 border-gray-100' : ''}
                          ${isUnavailable ? 'cursor-not-allowed' : !canEditAttendance ? 'cursor-default' : 'cursor-pointer hover:scale-110 hover:z-10 active:scale-95'}
                        `}
                        style={!isUnavailable && code ? {
                          backgroundColor: info?.hex.bg,
                          color: info?.hex.text,
                          borderColor: info?.hex.border,
                        } : {}}
                        title={!canEditAttendance
                          ? `${monthName} ${day}, ${monthYear} — Read-only access`
                          : isUnavailable
                            ? `${monthName} ${day}, ${monthYear} — ${availability.label}`
                            : info
                              ? `${monthName} ${day}, ${monthYear} — ${info.label}${record?.note ? ` — ${record.note}` : ''}`
                              : `${monthName} ${day}, ${monthYear} — No attendance exception`}
                      >
                        {availability.type === 'blackout' ? '×' : availability.type === 'weekend' ? day : info ? info.shortLabel : code || day}
                        {!isUnavailable && record?.note && (
                          <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-white/90 ring-1 ring-black/10" aria-label="Comment added" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-xs text-gray-400 text-center px-4">
        {!canEditAttendance
          ? 'Attendance history is read-only for this login.'
          : paintMode
          ? '🎨 Paint Mode: Select a code above, then tap days to mark them.'
          : 'Select any day to choose a status or edit its comment. Toggle Paint Mode to mark multiple days with one code.'
        }{canEditAttendance && ' Data saves automatically.'}
      </p>
      <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-100 border border-gray-200" /> Weekend</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-charcoal-800" /> Admin blackout</span>
      </div>

      <AttendancePickerModal
        picker={picker}
        onClose={() => setPicker(null)}
        onSave={(code, note) => {
          if (!canEditAttendance) return
          applyYearSnapshot(picker.date, setAttendanceCode(empKey, picker.date, code, note))
          setPicker(null)
        }}
      />
    </div>
  )
}
