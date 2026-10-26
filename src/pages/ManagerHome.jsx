// The landing page for a building manager.
//
// Liz, 2026-10-10: "When logged in as manager — make the dashboard page visible
// with buttons to see trackers?" A manager used to be dropped straight onto
// their roster, which is the busiest screen in the app and gave them no sense
// of where else they could go. This is the quiet page in front of it: their
// school, three numbers worth knowing before the day starts, and a button per
// tracker.
//
// Everything here is scoped to the manager's own building. The district
// Dashboard is a different page and stays administrator-only — a manager must
// never see another school's staff.
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../components/PinGate.jsx'
import { useLanguage } from '../components/LanguageProvider.jsx'
import { LOCATION_MAP } from '../data/locations.js'
import { getRosterForLocation } from '../data/employeeLocations.js'
import { getAttendanceCode, getAttendanceRecord, readFutureAttendance } from '../data/attendanceStore.js'
import { buildSchoolInsights, collectWeekExceptions } from '../data/dashboardInsights.js'
import { getWeekDates } from '../data/weekDates.js'
import SchoolDashboardInsights from '../components/SchoolDashboardInsights.jsx'
import { attendanceSeverityOf, getAllFlaggedEmployees } from '../data/hrFlags.js'
import {
  RECOGNITION_TYPE_MAP,
  earnsDailyStar,
  getAceBuckCount,
  getAllRecognitions,
  getDailyStarCount,
  getNextStarLevel,
  getStarLevel,
  isRecognitionInSchoolYear,
  schoolYearStartFor,
} from '../data/recognitionStore.js'
import { translateCount } from '../data/i18n.js'

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function ManagerHome() {
  const navigate = useNavigate()
  const [activeInsight, setActiveInsight] = useState(null)
  const { locationId, canEditRecognition, dataVersion, employeeId } = useAuth()
  const { locale, t, formatDate } = useLanguage()
  const school = LOCATION_MAP[locationId]
  const today = todayKey()

  const roster = useMemo(
    () => getRosterForLocation(locationId),
    [locationId, dataVersion]
  )

  // "Marked today" counts exceptions recorded, not people present: a blank day
  // is the normal case for someone who turned up, so this is a count of what
  // the manager has entered rather than a completeness score. Labeling it as
  // progress would imply nineteen entries were expected every morning.
  const markedToday = useMemo(
    () => roster.filter(employee => getAttendanceCode(employee.kronos_id || employee.id, today)).length,
    [roster, today, dataVersion]
  )

  const starsThisMonth = useMemo(() => {
    const monthPrefix = today.slice(0, 7)
    return getAllRecognitions().filter(record => (
      record.locationId === locationId
      && String(record.date || '').startsWith(monthPrefix)
      && earnsDailyStar(record)
    )).length
  }, [locationId, today, dataVersion])

  // The watch list a manager can act on: their own roster, third occurrence and
  // up. The district front page shows only fourth-and-up; a building manager
  // sees the earlier stage because they are the one who can still intervene.
  const needsAttention = useMemo(() => {
    const rosterKeys = new Set(roster.map(employee => String(employee.kronos_id || employee.id)))
    return getAllFlaggedEmployees().filter(status => (
      rosterKeys.has(String(status.empId)) && attendanceSeverityOf(status) !== 'none'
    )).length
  }, [roster, dataVersion])

  // The same four cards as the attendance tracker, for the current week.
  // Liz, 2026-10-11: they should be on the school's dashboard too, not only
  // on the overview. One component and one set of builders, so the two
  // screens cannot disagree about what a school's month looks like.
  const dates = useMemo(() => getWeekDates(0), [])
  const weekAttendance = useMemo(() => {
    const map = {}
    for (const employee of roster) {
      const empKey = employee.kronos_id || employee.id
      for (const dateKey of dates) {
        const record = getAttendanceRecord(empKey, dateKey)
        if (record) map[`${empKey}-${dateKey}`] = record
      }
    }
    return map
  }, [roster, dates, dataVersion])

  const schoolInsights = useMemo(
    () => buildSchoolInsights(roster, readFutureAttendance),
    [roster, dataVersion]
  )
  const weekExceptions = useMemo(
    () => collectWeekExceptions(roster, dates, weekAttendance),
    [roster, dates, weekAttendance]
  )
  const weekLabel = `${formatDate(dates[0], { dateStyle: 'medium' })} – ${formatDate(dates[6], { dateStyle: 'medium' })}`

  const openEmployeeRecord = employee => {
    navigate(`/employee/${encodeURIComponent(employee.kronos_id || employee.id)}`)
  }

  const tiles = [
    { label: t('managerHome.onRoster'), value: roster.length },
    { label: t('managerHome.markedToday'), value: markedToday },
    { label: t('managerHome.starsThisMonth'), value: starsThisMonth },
  ]

  return (
    <div className="space-y-5">
      <header className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-600">
          {t('managerHome.eyebrow')}
        </p>
        <h1 className="mt-1 text-xl font-bold text-gray-900 sm:text-2xl">
          {school?.name || t('managerHome.yourSchool')}
        </h1>
        <p className="mt-1 text-xs text-gray-500">{formatDate(today, { dateStyle: 'full' })}</p>

        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-gray-100 pt-4">
          {tiles.map(tile => (
            <div key={tile.label}>
              <dd className="text-2xl font-black text-gray-900">{tile.value}</dd>
              <dt className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 sm:text-xs">
                {tile.label}
              </dt>
            </div>
          ))}
        </dl>
      </header>

      <YourRecognition employeeId={employeeId} />

      <SchoolDashboardInsights
        activeInsight={activeInsight}
        onInsightChange={setActiveInsight}
        onEmployeeSelect={openEmployeeRecord}
        weekExceptions={weekExceptions}
        weekLabel={weekLabel}
        {...schoolInsights}
      />

      {needsAttention > 0 && (
        <Link
          to={`/location/${encodeURIComponent(locationId)}#hr-follow-up`}
          className="block rounded-xl border border-amber-200 bg-amber-50 p-4 hover:bg-amber-100"
        >
          <p className="text-sm font-bold text-amber-900">
            {translateCount(locale, 'managerHome.needsAttention', needsAttention)}
          </p>
          <p className="mt-0.5 text-xs text-amber-800">{t('managerHome.needsAttentionHint')}</p>
        </Link>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <TrackerButton
          to={`/location/${encodeURIComponent(locationId)}`}
          glyph="🗓"
          title={t('managerHome.attendanceTracker')}
          description={t('managerHome.attendanceTrackerHint')}
        />
        {canEditRecognition && (
          <TrackerButton
            to="/recognition"
            glyph="★"
            title={t('nav.allStars')}
            description={t('managerHome.recognitionHint')}
          />
        )}
        <TrackerButton
          to="/ledger"
          glyph="👤"
          title={t('nav.employeeRecords')}
          description={t('managerHome.recordsHint')}
        />
      </div>
    </div>
  )
}

function TrackerButton({ to, glyph, title, description }) {
  return (
    <Link
      to={to}
      className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-brand-300 hover:bg-brand-50"
    >
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-brand-100 text-lg text-brand-700" aria-hidden="true">
        {glyph}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-gray-900">{title}</span>
        <span className="mt-0.5 block text-xs text-gray-500">{description}</span>
      </span>
    </Link>
  )
}

// What this person has been given, on the page they land on.
//
// Liz, 2026-10-26: a manager's PIN can now be linked to their employee
// card, so the person signing in is known. Managers hand out recognition
// all day and had nowhere to see their own — it was on their employee
// card, which they had no particular reason to open.
//
// Shown only when the login is linked to somebody. A shared building login
// is not one person and gets nothing, rather than a panel about nobody.
function YourRecognition({ employeeId }) {
  if (!employeeId) return null

  const schoolYear = schoolYearStartFor(new Date())
  const records = getAllRecognitions().filter(record =>
    String(record.employeeId) === String(employeeId)
    && isRecognitionInSchoolYear(record, schoolYear))

  const stars = getDailyStarCount(records, employeeId, schoolYear)
  const bucks = getAceBuckCount(records, employeeId, schoolYear)
  const level = getStarLevel(stars)
  const next = getNextStarLevel(stars)
  const recent = records.slice(0, 3)

  return (
    <section className="overflow-hidden rounded-xl border border-[#3d3322] bg-[#15120e] text-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-[#e8c65c]/50 bg-[#e8c65c]/10 text-xl text-[#ffd75c]" aria-hidden="true">★</span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#e8c65c]">Your recognition</p>
            <p className="mt-0.5 text-xl font-black">
              {stars} earned star{stars === 1 ? '' : 's'}
              {bucks > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 align-middle text-xs font-semibold text-emerald-200">
                  <span aria-hidden="true">◆</span>{bucks} Coach Buck{bucks === 1 ? '' : 's'}
                </span>
              )}
            </p>
            <p className="mt-0.5 text-xs text-amber-100/75">
              {level ? `${level.symbol} ${level.name}` : 'Building toward Bronze Star'}
              {next ? ` · ${next.minimum - stars} more to ${next.name}` : ' · highest level'}
            </p>
          </div>
        </div>
        <Link
          to={`/employee/${encodeURIComponent(employeeId)}`}
          className="rounded-lg border border-[#e8c65c]/40 bg-[#e8c65c]/10 px-3 py-2 text-xs font-bold text-[#f4d87d] hover:bg-[#e8c65c]/20"
        >
          Open my record
        </Link>
      </div>

      {recent.length > 0 && (
        <div className="grid gap-px bg-white/10 sm:grid-cols-3">
          {recent.map(record => (
            <div key={record.id} className="bg-[#15120e] px-5 py-3">
              <p className="text-xs font-bold text-[#f4d87d]">
                {RECOGNITION_TYPE_MAP[record.type]?.label || record.type}
              </p>
              <p className="mt-0.5 text-[11px] text-white/60">
                {record.date}{record.criteria?.[0] ? ` · ${record.criteria[0]}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
