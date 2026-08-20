import { useState, useMemo, useEffect } from 'react'
import { ATTENDANCE_CODES, CODE_MAP } from '../data/attendanceCodes.js'
import { getEmployeeYearAttendance, setAttendanceCode } from '../data/attendanceStore.js'
import { getAttendanceStageLabel, getEmployeeAttendanceStatus, isFlagged } from '../data/hrFlags.js'
import { getEmployeeByKey, saveEmployeeNotes, setEmployeeActive } from '../data/employeeLocations.js'
import { getDateAvailability } from '../data/blackoutDates.js'
import { useAuth } from '../components/PinGate.jsx'
import AttendancePickerModal from '../components/AttendancePickerModal.jsx'
import EmployeeEditForm from '../components/EmployeeEditForm.jsx'
import { formatBirthday } from '../data/employeeFields.js'

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
  const { role, canManageRoster } = useAuth()
  const [year, setYear] = useState(new Date().getFullYear())
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

  useEffect(() => {
    if (!empKey) return
    setAttendance(getEmployeeYearAttendance(empKey, year))
  }, [empKey, year])

  useEffect(() => {
    const currentEmployee = getEmployeeByKey(empKey)
    setNotesDraft(currentEmployee?.notes || '')
    setInactiveReason(currentEmployee?.inactive_reason || '')
    setNotesSaved(false)
    setConfirmInactive(false)
    setShowEditEmployee(false)
  }, [empKey, employee?.notes, employee?.inactive_reason])

  const handleDayClick = (dateKey) => {
    if (getDateAvailability(dateKey).unavailable) return
    if (paintMode) {
      setAttendance(setAttendanceCode(empKey, dateKey, selectedCode))
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
    if (paintMode && isPainting && !getDateAvailability(dateKey).unavailable) {
      setAttendance(setAttendanceCode(empKey, dateKey, selectedCode))
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

  // Pre-compute month stats for all 12 months (no hooks inside .map)
  const allMonthStats = useMemo(() => {
    return MONTHS.map((_, monthIdx) => getMonthStats(attendance, year, monthIdx))
  }, [attendance, year])

  const today = new Date()
  const isCurrentYear = year === today.getFullYear()

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

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {role === 'admin' && canManageRoster && (
              <button
                type="button"
                onClick={() => setShowEditEmployee(value => !value)}
                className="px-3 py-2 rounded-lg border border-brand-200 bg-brand-50 text-brand-700 text-xs font-semibold hover:bg-brand-100"
              >
                {showEditEmployee ? 'Close edit' : 'Edit employee'}
              </button>
            )}
            <button
              onClick={() => setYear(y => y - 1)}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-base sm:text-lg font-bold text-gray-900 min-w-[50px] text-center">{year}</span>
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
          <div>
            <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide">T-shirt Size</p>
            <p className="text-xs sm:text-sm font-medium text-gray-700 mt-0.5">{tShirtSize || '—'}</p>
          </div>
        </div>
      </div>

      {role === 'admin' && canManageRoster && showEditEmployee && (
        <EmployeeEditForm
          employee={employee}
          onCancel={() => setShowEditEmployee(false)}
          onSaved={savedEmployee => {
            onEmployeeUpdate?.(savedEmployee)
            setShowEditEmployee(false)
          }}
        />
      )}

      {role === 'admin' && canManageRoster && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row gap-5">
            <div className="flex-1">
              <label htmlFor="employee-admin-notes" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Employee notes
              </label>
              <p className="text-[11px] text-gray-400 mt-1">Administrative notes saved with this employee record in this browser.</p>
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
            <button
              onClick={() => setPaintMode(!paintMode)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${
                paintMode
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {paintMode ? '🎨 Paint ON' : '🎨 Paint Mode'}
            </button>
            {paintMode && (
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

          {!paintMode && (
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

      {/* Month toggle for mobile */}
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

      {/* 12 Month Calendar Grid */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4"
        onMouseLeave={() => setIsPainting(false)}
      >
        {MONTHS.map((monthName, monthIdx) => {
          if (!isMonthVisible(monthIdx)) return null

          const daysInMonth = getDaysInMonth(year, monthIdx)
          const firstWeekday = getFirstWeekday(year, monthIdx)
          const monthStats = allMonthStats[monthIdx]

          return (
            <div key={monthIdx} className="bg-white rounded-xl border border-gray-200 p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-900">{monthName}</h3>
                <div className="flex gap-1">
                  {ATTENDANCE_CODES.filter(c => c.code && monthStats[c.code] > 0).map(c => (
                    <span
                      key={c.code}
                      className="inline-flex items-center justify-center rounded text-[9px] font-bold border px-1"
                      style={{ backgroundColor: c.hex.bg, color: c.hex.text, borderColor: c.hex.border }}
                      title={`${c.label}: ${monthStats[c.code]}`}
                    >
                      {c.shortLabel}{monthStats[c.code]}
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {WEEKDAYS.map((d, i) => (
                  <div key={i} className="text-center text-[9px] font-medium text-gray-400">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {Array.from({ length: firstWeekday }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }).map((_, dayIdx) => {
                  const day = dayIdx + 1
                  const dateKey = formatDateKey(year, monthIdx, day)
                  const record = attendance[dateKey]
                  const code = record?.code || ''
                  const info = CODE_MAP[code]
                  const availability = getDateAvailability(dateKey)
                  const isFuture = isCurrentYear && new Date(year, monthIdx, day) > today
                  const isUnavailable = availability.unavailable

                  return (
                    <button
                      key={day}
                      onClick={() => handleDayClick(dateKey)}
                      onMouseDown={() => paintMode && !isUnavailable && setIsPainting(true)}
                      onMouseUp={() => setIsPainting(false)}
                      onMouseEnter={() => handleDayMouseEnter(dateKey)}
                      disabled={isFuture || isUnavailable}
                      className={`
                        relative aspect-square rounded text-[10px] font-medium
                        flex items-center justify-center transition-all
                        ${isUnavailable ? 'border' : code ? 'border' : 'border border-gray-100'}
                        ${availability.type === 'blackout' ? 'bg-charcoal-800 text-white border-charcoal-800' : ''}
                        ${availability.type === 'weekend' ? 'bg-gray-100 text-gray-300 border-gray-100' : ''}
                        ${isFuture ? 'opacity-30 cursor-not-allowed' : isUnavailable ? 'cursor-not-allowed' : 'cursor-pointer hover:scale-110 hover:z-10 active:scale-95'}
                      `}
                      style={!isUnavailable && code ? {
                        backgroundColor: info?.hex.bg,
                        color: info?.hex.text,
                        borderColor: info?.hex.border,
                      } : {}}
                      title={isUnavailable
                        ? `${monthName} ${day}, ${year} — ${availability.label}`
                        : info
                          ? `${monthName} ${day}, ${year} — ${info.label}${record?.note ? ` — ${record.note}` : ''}`
                          : `${monthName} ${day}, ${year} — No attendance exception`}
                    >
                      {availability.type === 'blackout' ? '×' : availability.type === 'weekend' ? day : code ? info.shortLabel : day}
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

      <p className="text-xs text-gray-400 text-center px-4">
        {paintMode
          ? '🎨 Paint Mode: Select a code above, then tap days to mark them.'
          : 'Select any day to choose a status or edit its comment. Toggle Paint Mode to mark multiple days with one code.'
        }{' '}Data saves automatically to your browser.
      </p>
      <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-100 border border-gray-200" /> Weekend</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-charcoal-800" /> Admin blackout</span>
      </div>

      <AttendancePickerModal
        picker={picker}
        onClose={() => setPicker(null)}
        onSave={(code, note) => {
          setAttendance(setAttendanceCode(empKey, picker.date, code, note))
          setPicker(null)
        }}
      />
    </div>
  )
}
