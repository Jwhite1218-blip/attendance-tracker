import { useState, useMemo, useEffect } from 'react'
import { useProgramTerms } from '../components/useProgramTerms.js'
import { useParams, Link, Navigate, useNavigate } from 'react-router-dom'
import { LOCATIONS, LOCATION_MAP } from '../data/locations.js'
import { getRosterForLocation } from '../data/employeeLocations.js'
import { ATTENDANCE_CODES, CODE_MAP } from '../data/attendanceCodes.js'
import { getAttendanceRecord, getEmployeeAttendanceYears, getEmployeeYearAttendance, readFutureAttendance, setAttendanceCode } from '../data/attendanceStore.js'
import { buildSchoolInsights, collectWeekExceptions } from '../data/dashboardInsights.js'
import { ATTENDANCE_SEVERITY_CLASS, attendanceSeverity, getAllFlaggedEmployees } from '../data/hrFlags.js'
import { getDateAvailability } from '../data/blackoutDates.js'
import { getWeekDates } from '../data/weekDates.js'
import { StatusBadge } from '../components/StatusBadge.jsx'
import AttendancePickerModal from '../components/AttendancePickerModal.jsx'
import HrFollowUpPanel from '../components/HrFollowUpPanel.jsx'
import SchoolDashboardInsights from '../components/SchoolDashboardInsights.jsx'
import { useAuth } from '../components/PinGate.jsx'
import TransferModal from '../components/TransferModal.jsx'
import AddEmployeeModal from '../components/AddEmployeeModal.jsx'
import EmployeeEditForm from '../components/EmployeeEditForm.jsx'
import { hasLizAdminAccess } from '../data/futureTools.js'
import { rosterActionMode } from '../data/approvalRequests.js'

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
  const navigate = useNavigate()
  const access = useAuth()
  const { role, locationId: myLocationId, canManageRoster, canEditAttendance, dataVersion } = access
  const lizAdminAccess = hasLizAdminAccess(access)
  const rosterMode = rosterActionMode(access)
  const canTouchRoster = rosterMode !== 'none'
  const [showAddEmployee, setShowAddEmployee] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  // School-role sessions are always locked to their own school, regardless of URL
  const id = role === 'school' ? myLocationId : urlId
  const location = LOCATION_MAP[id]
  const [weekOffset, setWeekOffset] = useState(0)
  const [attendance, setAttendance] = useState({})
  const [selectedCode, setSelectedCode] = useState('UNEX')
  const [paintMode, setPaintMode] = useState(false)
  const [isPainting, setIsPainting] = useState(false)
  const [transferTarget, setTransferTarget] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [picker, setPicker] = useState(null)
  const [activeInsight, setActiveInsight] = useState(null)

  const dates = useMemo(() => getWeekDates(weekOffset), [weekOffset])
  const roster = useMemo(() => getRosterForLocation(id), [id, refreshKey, dataVersion])
  const openEmployeeRecord = employee => {
    const employeeId = employee.kronos_id || employee.id
    navigate(`/employee/${encodeURIComponent(employeeId)}`)
  }

  const flaggedEmployees = useMemo(() => {
    const rosterIds = new Set(roster.map(employee => String(employee.kronos_id || employee.id)))
    return getAllFlaggedEmployees()
      .filter(flag => rosterIds.has(String(flag.empId)))
      .map(flag => ({ ...flag, employee: roster.find(employee => String(employee.kronos_id || employee.id) === String(flag.empId)) }))
      .filter(flag => flag.employee)
  }, [roster, dataVersion])

  // Load this week's attendance for the roster from the shared store
  useEffect(() => {
    const next = {}
    roster.forEach(emp => {
      const empId = emp.kronos_id || emp.id
      dates.forEach(d => {
        const record = getAttendanceRecord(empId, d)
        if (record) next[`${empId}-${d}`] = { ...record, empId }
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

  const weekExceptions = useMemo(
    () => collectWeekExceptions(roster, dates, attendance),
    [roster, dates, attendance]
  )

  const schoolInsights = useMemo(
    () => buildSchoolInsights(roster, readFutureAttendance),
    [attendance, roster]
  )

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

  // ─── LOCATION ROSTER VIEW ───
  const handleToggle = (empId, date) => {
    if (!canEditAttendance || !paintMode || getDateAvailability(date).unavailable) return
    const key = `${empId}-${date}`
    setAttendanceCode(empId, date, selectedCode)
    setAttendance(prev => ({ ...prev, [key]: { code: selectedCode, date, empId } }))
  }

  const handleSetCode = (empId, date, code, note = '') => {
    if (!canEditAttendance || getDateAvailability(date).unavailable) return
    const key = `${empId}-${date}`
    setAttendanceCode(empId, date, code, note)
    if (code === '') {
      setAttendance(prev => { const next = { ...prev }; delete next[key]; return next })
    } else {
      setAttendance(prev => ({ ...prev, [key]: { code, date, empId, ...(note ? { note } : {}) } }))
    }
  }

  const handleSetAll = (date, code) => {
    if (!canEditAttendance || getDateAvailability(date).unavailable) return
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
          <span className="text-xs sm:text-sm font-medium text-charcoal-100 px-2 sm:px-3 py-2 whitespace-nowrap">
            {formatDate(dates[0])} – {formatDate(dates[6])}
          </span>
          <button onClick={() => setWeekOffset(w => w + 1)} className="p-2 rounded-lg border border-charcoal-600 hover:bg-charcoal-600 text-charcoal-200">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>

      {canTouchRoster && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setShowAddEmployee(true)} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">+ Add employee</button>
          <p className="text-xs text-charcoal-200">Add to {location.name}, or use Edit beside an employee’s name.</p>
        </div>
      )}

      <SchoolDashboardInsights
        activeInsight={activeInsight}
        onInsightChange={setActiveInsight}
        onEmployeeSelect={openEmployeeRecord}
        weekExceptions={weekExceptions}
        weekLabel={`${formatDate(dates[0])} – ${formatDate(dates[6])}`}
        {...schoolInsights}
      />

      {/* Quick Stats */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Exceptions</span>
          <span className="text-sm font-semibold text-gray-700">{weekStats.marked}</span>
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
        {canEditAttendance ? (
          <>
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
            <span className="text-xs text-gray-400 ml-auto hidden sm:inline">{paintMode ? 'Click or drag to mark' : 'Select a day to choose a status and add a comment'}</span>
          </>
        ) : (
          <span className="text-sm font-semibold text-gray-600">Read-only school review · Attendance controls are disabled</span>
        )}
      </div>

      {/* Keep the active week visible while Liz scrolls through the mobile roster. */}
      <div
        className={`md:hidden sticky ${canEditAttendance ? 'top-16' : 'top-[97px]'} z-30 -mx-3 mb-3 border-y border-charcoal-600 bg-charcoal-800/95 px-3 py-2 shadow-lg backdrop-blur-sm`}
      >
        <p className="mb-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-charcoal-100">
          {formatDate(dates[0])} – {formatDate(dates[6])}
        </p>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-charcoal-500 bg-charcoal-500">
          {dates.map(date => {
            const { weekday, day } = formatDateShort(date)
            const availability = getDateAvailability(date)

            return (
              <div
                key={date}
                className={`flex min-h-[42px] flex-col items-center justify-center ${
                  availability.type === 'blackout'
                    ? 'bg-charcoal-900 text-white'
                    : availability.type === 'weekend'
                      ? 'bg-gray-500 text-white'
                      : 'bg-gray-50 text-gray-800'
                }`}
                title={availability.unavailable ? availability.label : formatDate(date)}
              >
                <span className="text-[9px] font-semibold uppercase">{weekday[0]}</span>
                <span className="text-xs font-bold">{day}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ─── MOBILE: Card-based layout ─── */}
      <div className="md:hidden space-y-3">
        {roster.map((emp, idx) => {
          const empAtt = dates.map(d => {
            const key = `${emp.kronos_id || emp.id}-${d}`
            return { date: d, code: attendance[key]?.code || '' }
          })

          return (
            <div key={emp.id} className="bg-white rounded-xl border border-gray-300 overflow-hidden">
              {/* Employee header - tap to open detail */}
              <div className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors">
                <button
                  onClick={() => openEmployeeRecord(emp)}
                  className="flex items-center gap-3 text-left flex-1 min-w-0"
                >
                  <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-semibold text-brand-600">{emp.first_name?.[0]}{emp.last_name?.[0]}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium flex items-center gap-1 ${ATTENDANCE_SEVERITY_CLASS[attendanceSeverity(emp.kronos_id || emp.id)]}`}>
                      {emp.first_name} {emp.last_name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{emp.position}</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                {canTouchRoster && <button type="button" onClick={() => setEditTarget(emp)} aria-label={`Edit ${emp.first_name} ${emp.last_name}`} className="text-xs font-semibold text-brand-700 px-2 py-1.5">Edit</button>}
                {canTouchRoster && (
                  <button
                    onClick={() => setTransferTarget(emp)}
                    title={`Transfer ${emp.first_name} ${emp.last_name} to another school`}
                    className="flex-shrink-0 text-amber-600 hover:text-amber-700 p-1.5 -mr-1.5"
                  >
                    🔄
                  </button>
                )}
              </div>

              {/* Day cells - horizontal row */}
              <div className="grid grid-cols-7 gap-px bg-gray-300 border-t border-gray-300">
                {empAtt.map(({ date, code }) => {
                  const { weekday, day } = formatDateShort(date)
                  const availability = getDateAvailability(date)
                  return (
                    <button
                      key={date}
                      onClick={() => {
                        if (!canEditAttendance || availability.unavailable) return
                        if (paintMode) {
                          handleToggle(emp.kronos_id || emp.id, date)
                        } else {
                          const key = `${emp.kronos_id || emp.id}-${date}`
                          setPicker({
                            empId: emp.kronos_id || emp.id,
                            date,
                            formattedDate: formatDate(date),
                            empName: `${emp.first_name} ${emp.last_name}`,
                            code: attendance[key]?.code || '',
                            note: attendance[key]?.note || '',
                          })
                        }
                      }}
                      disabled={!canEditAttendance || availability.unavailable}
                      title={!canEditAttendance ? `${formatDate(date)} — Read-only access` : availability.unavailable ? availability.label : formatDate(date)}
                      className={`p-2 flex flex-col items-center gap-1 transition-colors ${
                        availability.type === 'blackout'
                          ? 'bg-charcoal-800 text-white cursor-not-allowed'
                          : availability.type === 'weekend'
                            ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                            : canEditAttendance ? 'bg-gray-50 active:bg-gray-100' : 'bg-gray-50 cursor-default'
                      }`}
                    >
                      <span className={`text-[10px] uppercase ${availability.unavailable ? 'text-current opacity-70' : 'text-gray-400'}`}>{weekday[0]}</span>
                      <span className={`text-[10px] font-medium ${availability.unavailable ? 'text-current' : 'text-gray-500'}`}>{day}</span>
                      {availability.type === 'blackout' ? (
                        <span className="inline-flex items-center justify-center text-sm font-bold w-[28px] h-[22px]">×</span>
                      ) : availability.type === 'weekend' ? (
                        <span className="inline-flex items-center justify-center text-xs w-[28px] h-[22px]">—</span>
                      ) : code ? (
                        <span className="relative">
                          <StatusBadge code={code} size="small" />
                          {attendance[`${emp.kronos_id || emp.id}-${date}`]?.note && (
                            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-brand-600 ring-1 ring-white" title="Comment added" />
                          )}
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center rounded border border-dashed border-gray-400 bg-white/70 text-xs text-gray-500 w-[28px] h-[22px]">·</span>
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
            {/* Keep the header in normal table flow. A sticky <thead> inside
                the horizontal overflow container was shifting over row one,
                which made each building's first employee appear missing. */}
            <thead className="relative z-20 shadow-sm">
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="sticky left-0 bg-gray-50 z-30 text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3" style={{ minWidth: '220px' }}>Employee</th>
                {dates.map(d => {
                  const availability = getDateAvailability(d)
                  return (
                    <th
                      key={d}
                      className={`text-center px-2 py-3 ${availability.type === 'blackout' ? 'bg-charcoal-800 text-white' : availability.type === 'weekend' ? 'bg-gray-300 text-gray-700' : 'bg-gray-50'}`}
                      style={{ minWidth: '90px' }}
                      title={availability.unavailable ? availability.label : undefined}
                    >
                      <div className={`text-xs font-medium uppercase tracking-wide ${availability.unavailable ? 'text-current' : 'text-gray-500'}`}>{formatDate(d)}</div>
                      <button
                        onClick={() => handleSetAll(d, '')}
                        disabled={!canEditAttendance || availability.unavailable}
                        className={`mt-1 text-[10px] ${availability.unavailable ? 'text-current opacity-60 cursor-not-allowed' : 'text-gray-400 hover:text-brand-500'}`}
                      >
                        {availability.type === 'blackout' ? availability.label : 'Clear All'}
                      </button>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {roster.map((emp, idx) => (
                <tr key={emp.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}>
                  <td className={`sticky left-0 z-10 px-4 py-3 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEmployeeRecord(emp)} className="flex items-center gap-3 text-left group flex-1 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-brand-600">{emp.first_name?.[0]}{emp.last_name?.[0]}</span>
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-medium transition-colors truncate flex items-center gap-1 ${ATTENDANCE_SEVERITY_CLASS[attendanceSeverity(emp.kronos_id || emp.id)]} ${attendanceSeverity(emp.kronos_id || emp.id) === 'none' ? 'group-hover:text-brand-700' : ''}`}>
                            {emp.first_name} {emp.last_name}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{emp.position}</p>
                        </div>
                        <svg className="w-4 h-4 text-gray-300 group-hover:text-brand-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                      {canTouchRoster && <button type="button" onClick={() => setEditTarget(emp)} aria-label={`Edit ${emp.first_name} ${emp.last_name}`} className="text-xs font-semibold text-brand-700 px-2 py-1.5">Edit</button>}
                      {canTouchRoster && (
                        <button
                          onClick={() => setTransferTarget(emp)}
                          title={`Transfer ${emp.first_name} ${emp.last_name} to another school`}
                          className="flex-shrink-0 text-amber-600 hover:text-amber-700 p-1"
                        >
                          🔄
                        </button>
                      )}
                    </div>
                  </td>
                  {dates.map(d => {
                    const key = `${emp.kronos_id || emp.id}-${d}`
                    const code = attendance[key]?.code || ''
                    const availability = getDateAvailability(d)
                    return (
                      <td key={d} className={`text-center px-2 py-3 ${availability.type === 'blackout' ? 'bg-charcoal-800' : availability.type === 'weekend' ? 'bg-gray-300' : 'bg-gray-50/70'}`}>
                        <button
                          onClick={() => {
                            if (!canEditAttendance || availability.unavailable) return
                            if (paintMode) {
                              handleToggle(emp.kronos_id || emp.id, d)
                            } else {
                              setPicker({
                                empId: emp.kronos_id || emp.id,
                                date: d,
                                formattedDate: formatDate(d),
                                empName: `${emp.first_name} ${emp.last_name}`,
                                code: attendance[key]?.code || '',
                                note: attendance[key]?.note || '',
                              })
                            }
                          }}
                          onMouseDown={() => canEditAttendance && paintMode && !availability.unavailable && setIsPainting(true)}
                          onMouseUp={() => setIsPainting(false)}
                          onMouseEnter={() => { if (canEditAttendance && paintMode && isPainting) handleToggle(emp.kronos_id || emp.id, d) }}
                          disabled={!canEditAttendance || availability.unavailable}
                          title={!canEditAttendance ? `${formatDate(d)} — Read-only access` : availability.unavailable ? availability.label : formatDate(d)}
                          className={`w-full flex justify-center ${availability.unavailable ? 'cursor-not-allowed' : !canEditAttendance ? 'cursor-default' : ''}`}
                        >
                          {availability.type === 'blackout' ? (
                            <span className="inline-flex items-center justify-center text-sm font-bold text-white w-[28px] h-[22px]">×</span>
                          ) : availability.type === 'weekend' ? (
                            <span className="inline-flex items-center justify-center text-xs text-gray-600 w-[28px] h-[22px]">—</span>
                          ) : code ? (
                            <span className="relative">
                              <StatusBadge code={code} size="small" />
                              {attendance[key]?.note && (
                                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-brand-600 ring-1 ring-white" title="Comment added" />
                              )}
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center rounded border border-dashed border-gray-400 bg-white/70 text-xs text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors w-[28px] h-[22px]">·</span>
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

      {/* HR Attendance Follow-Up — this building's roster only */}
      <div className="mt-4">
        <HrFollowUpPanel flaggedEmployees={flaggedEmployees} onEmployeeSelect={openEmployeeRecord} showLocation={false} />
      </div>

      {/* Footer actions */}
      <div className="mt-4">
        <p className="text-xs text-charcoal-300">{canEditAttendance ? 'Select a day to mark an exception or add a comment.' : 'Attendance is read-only.'} Select a name for full-year history{canTouchRoster ? ', or 🔄 to transfer that employee.' : '.'}</p>
        <div className="flex items-center gap-3 mt-1 text-[10px] text-charcoal-300">
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-gray-300 border border-gray-400" /> Weekend</span>
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-charcoal-800 border border-charcoal-500" /> Admin blackout</span>
        </div>
      </div>

      {canTouchRoster && transferTarget && (
        <TransferModal
          employee={transferTarget}
          onClose={() => setTransferTarget(null)}
          onTransferred={() => { setRefreshKey(k => k + 1); setTransferTarget(null) }}
        />
      )}

      {canTouchRoster && showAddEmployee && (
        <AddEmployeeModal key={id} open defaultLocation={id} onClose={() => setShowAddEmployee(false)} onAdded={() => { setShowAddEmployee(false); setRefreshKey(k => k + 1) }} />
      )}
      {canTouchRoster && editTarget && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/45 p-3" role="dialog" aria-modal="true" aria-label={`Edit ${editTarget.first_name} ${editTarget.last_name}`} onKeyDown={event => { if (event.key === 'Escape') setEditTarget(null) }}>
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <EmployeeEditForm key={editTarget.kronos_id || editTarget.id} employee={editTarget} onCancel={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); setRefreshKey(k => k + 1) }} />
          </div>
        </div>
      )}

      <AttendancePickerModal
        picker={picker}
        onClose={() => setPicker(null)}
        onSave={(code, note) => {
          if (!canEditAttendance) return
          handleSetCode(picker.empId, picker.date, code, note)
          setPicker(null)
        }}
      />
    </div>
  )
}
