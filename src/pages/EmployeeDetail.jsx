import { useState, useMemo, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ATTENDANCE_CODES, CODE_MAP, CODE_CYCLE } from '../data/attendanceCodes.js'

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

export default function EmployeeDetail({ employee }) {
  const [year, setYear] = useState(new Date().getFullYear())
  const [attendance, setAttendance] = useState({})
  const [selectedCode, setSelectedCode] = useState('U')
  const [paintMode, setPaintMode] = useState(false)
  const [isPainting, setIsPainting] = useState(false)

  const empKey = employee?.kronos_id || employee?.id

  // Load saved attendance from localStorage
  useEffect(() => {
    if (!empKey) return
    const saved = localStorage.getItem(`att-emp-${empKey}-${year}`)
    if (saved) {
      setAttendance(JSON.parse(saved))
    } else {
      setAttendance({})
    }
  }, [empKey, year])

  // Save attendance to localStorage
  useEffect(() => {
    if (!empKey) return
    localStorage.setItem(`att-emp-${empKey}-${year}`, JSON.stringify(attendance))
  }, [attendance, empKey, year])

  const handleDayClick = (dateKey) => {
    if (paintMode) {
      setAttendance(prev => ({
        ...prev,
        [dateKey]: { code: selectedCode, date: dateKey }
      }))
    } else {
      // Cycle through codes
      const current = attendance[dateKey]?.code ?? ''
      const currentIdx = CODE_CYCLE.indexOf(current)
      const nextCode = CODE_CYCLE[(currentIdx + 1) % CODE_CYCLE.length]
      if (nextCode === '') {
        // Remove if cycling back to Present
        setAttendance(prev => {
          const next = { ...prev }
          delete next[dateKey]
          return next
        })
      } else {
        setAttendance(prev => ({
          ...prev,
          [dateKey]: { code: nextCode, date: dateKey }
        }))
      }
    }
  }

  const handleDayMouseEnter = (dateKey) => {
    if (paintMode && isPainting) {
      setAttendance(prev => ({
        ...prev,
        [dateKey]: { code: selectedCode, date: dateKey }
      }))
    }
  }

  // Year stats
  const yearStats = useMemo(() => {
    const stats = {}
    ATTENDANCE_CODES.forEach(c => {
      if (c.code !== '') stats[c.code] = 0
    })
    stats.present = 0
    stats.totalMarked = 0

    Object.values(attendance).forEach(record => {
      if (record.code && record.code !== '') {
        stats[record.code] = (stats[record.code] || 0) + 1
        stats.totalMarked++
      }
    })

    return stats
  }, [attendance])

  // Calculate days passed in the year (up to today or full year if past)
  const today = new Date()
  const isCurrentYear = year === today.getFullYear()
  const daysPassed = isCurrentYear
    ? Math.floor((today - new Date(year, 0, 1)) / (1000 * 60 * 60 * 24)) + 1
    : 365

  // Get service info
  const serviceDate = employee?.service_date
  const hireDate = employee?.hire_date
  const yearsOfService = serviceDate
    ? Math.floor((new Date() - new Date(serviceDate)) / (1000 * 60 * 60 * 24 * 365))
    : null

  return (
    <div className="space-y-6">
      {/* Employee Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
              <span className="text-lg font-bold text-brand-600">
                {(employee?.first_name?.[0] || '')}{(employee?.last_name?.[0] || '')}
              </span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {employee?.first_name} {employee?.last_name}
              </h2>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-gray-500">
                <span>ID: {employee?.kronos_id}</span>
                <span>{employee?.position}</span>
                {employee?.location && <span>{employee?.location}</span>}
                {yearsOfService != null && <span>{yearsOfService} yrs service</span>}
              </div>
            </div>
          </div>

          {/* Year selector */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setYear(y => y - 1)}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-lg font-bold text-gray-900 min-w-[60px] text-center">{year}</span>
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

        {/* Employee details */}
        {(hireDate || employee?.weekly_hours || employee?.pay_amount) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100">
            {hireDate && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Hire Date</p>
                <p className="text-sm font-medium text-gray-700 mt-0.5">{hireDate}</p>
              </div>
            )}
            {serviceDate && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Service Date</p>
                <p className="text-sm font-medium text-gray-700 mt-0.5">{serviceDate}</p>
              </div>
            )}
            {employee?.weekly_hours && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Weekly Hours</p>
                <p className="text-sm font-medium text-gray-700 mt-0.5">{employee.weekly_hours} hrs</p>
              </div>
            )}
            {employee?.pay_amount && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Pay Rate</p>
                <p className="text-sm font-medium text-gray-700 mt-0.5">${employee.pay_amount}/hr</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toolbar: Paint mode + Code legend */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Paint mode toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPaintMode(!paintMode)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                paintMode
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {paintMode ? '🎨 Paint Mode ON' : '🎨 Paint Mode'}
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
            <p className="text-xs text-gray-400 flex items-center">
              Click any day to cycle through attendance codes. Hold & drag in Paint Mode to mark multiple days at once.
            </p>
          )}
        </div>

        {/* Code Legend */}
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
          {ATTENDANCE_CODES.map(c => (
            <div
              key={c.code || 'present'}
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
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Days Marked</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{yearStats.totalMarked}</p>
        </div>
        {ATTENDANCE_CODES.filter(c => c.code !== '' && yearStats[c.code] > 0).slice(0, 5).map(c => (
          <div key={c.code} className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-xs uppercase tracking-wide" style={{ color: c.hex.text }}>{c.shortLabel}</p>
            <p className="text-xl font-bold mt-1" style={{ color: c.hex.text }}>{yearStats[c.code]}</p>
          </div>
        ))}
      </div>

      {/* 12 Month Calendar Grid */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        onMouseLeave={() => setIsPainting(false)}
      >
        {MONTHS.map((monthName, monthIdx) => {
          const daysInMonth = getDaysInMonth(year, monthIdx)
          const firstWeekday = getFirstWeekday(year, monthIdx)

          return (
            <div key={monthIdx} className="bg-white rounded-xl border border-gray-200 p-3">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">{monthName}</h3>
              {/* Weekday headers */}
              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {WEEKDAYS.map((d, i) => (
                  <div key={i} className="text-center text-[9px] font-medium text-gray-400">{d}</div>
                ))}
              </div>
              {/* Days */}
              <div className="grid grid-cols-7 gap-0.5">
                {/* Empty cells before first day */}
                {Array.from({ length: firstWeekday }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {/* Day cells */}
                {Array.from({ length: daysInMonth }).map((_, dayIdx) => {
                  const day = dayIdx + 1
                  const dateKey = formatDateKey(year, monthIdx, day)
                  const record = attendance[dateKey]
                  const code = record?.code || ''
                  const info = CODE_MAP[code]
                  const isWeekend = (firstWeekday + dayIdx) % 7 === 0 || (firstWeekday + dayIdx) % 7 === 6
                  const isFuture = isCurrentYear && new Date(year, monthIdx, day) > today

                  return (
                    <button
                      key={day}
                      onClick={() => handleDayClick(dateKey)}
                      onMouseDown={() => paintMode && setIsPainting(true)}
                      onMouseUp={() => setIsPainting(false)}
                      onMouseEnter={() => handleDayMouseEnter(dateKey)}
                      disabled={isFuture}
                      className={`
                        relative aspect-square rounded text-[10px] font-medium
                        flex items-center justify-center transition-all
                        ${code ? 'border' : 'border border-gray-100'}
                        ${isWeekend && !code ? 'bg-gray-50' : ''}
                        ${isFuture ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:scale-110 hover:z-10'}
                      `}
                      style={code ? {
                        backgroundColor: info?.hex.bg,
                        color: info?.hex.text,
                        borderColor: info?.hex.border,
                      } : {}}
                      title={info ? `${monthName} ${day}, ${year} — ${info.label}` : `${monthName} ${day}, ${year} — Present`}
                    >
                      {code ? info.shortLabel : day}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-400 text-center">
        {paintMode
          ? '🎨 Paint Mode: Select a code above, then click/drag across days to mark them.'
          : 'Click any day to cycle through codes. Toggle Paint Mode to mark multiple days with one code.'
        } Data saves automatically to your browser.
      </p>
    </div>
  )
}
