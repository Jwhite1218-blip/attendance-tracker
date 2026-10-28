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
import { getAttendanceCode, getEmployeeYearAttendance, readFutureAttendance } from '../data/attendanceStore.js'
import { buildSchoolInsights, collectMonthExceptions } from '../data/dashboardInsights.js'
import SchoolDashboardInsights from '../components/SchoolDashboardInsights.jsx'
import HrFollowUpPanel from '../components/HrFollowUpPanel.jsx'
import YourRecognition from '../components/YourRecognition.jsx'
import RecognitionMetrics, { recognitionTilesFor } from '../components/RecognitionMetrics.jsx'
import { attendanceSeverityOf, getAllFlaggedEmployees, splitFlaggedByEmploymentStatus } from '../data/hrFlags.js'
import {
  RECOGNITION_TYPE_MAP,
  getAceBuckCount,
  getAllRecognitions,
  getDailyStarCount,
  getNextStarLevel,
  getStarLevel,
  isRecognitionInSchoolYear,
  schoolYearStartFor,
} from '../data/recognitionStore.js'


function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function ManagerHome() {
  const navigate = useNavigate()
  const [activeInsight, setActiveInsight] = useState(null)
  const { locationId, locationIds, onLocationChange, canEditRecognition, dataVersion, employeeId } = useAuth()
  const { t, formatDate } = useLanguage()
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

  // The watch list a manager can act on: their own roster, third occurrence
  // and up. The district front page shows only fourth-and-up; a building
  // manager sees the earlier stage because they are the one who can still
  // intervene.
  //
  // Liz, 2026-10-26: shown here in full, through the panel the district
  // dashboard uses, rather than as a count linking somewhere else. It is
  // the one list on this page that somebody has to act on, and it was the
  // one thing they had to leave the page to read.
  const flaggedEmployees = useMemo(() => {
    const byKey = new Map(roster.map(employee => [String(employee.kronos_id || employee.id), employee]))
    const mine = getAllFlaggedEmployees()
      .map(status => ({ ...status, employee: byKey.get(String(status.empId)) }))
      .filter(status => status.employee && attendanceSeverityOf(status) !== 'none')
    return splitFlaggedByEmploymentStatus(mine).active
  }, [roster, dataVersion])

  // The same three cards the district dashboard shows, built by the same
  // helpers over this school's roster. Liz, 2026-10-11: they should be on
  // the school's dashboard too, not only on the overview. Liz, 2026-10-26:
  // and they should mean the same thing on both — exceptions counted a
  // week here and a month there.
  const schoolInsights = useMemo(
    () => buildSchoolInsights(roster, readFutureAttendance),
    [roster, dataVersion]
  )
  const monthExceptions = useMemo(
    () => collectMonthExceptions(roster, today.slice(0, 7), getEmployeeYearAttendance),
    [roster, today, dataVersion]
  )

  // One building's worth of the district's recognition row. The scope is
  // this kitchen, which is the whole difference between the two pages.
  const recognitionTiles = useMemo(
    () => recognitionTilesFor({ locationIds: [locationId] }),
    [locationId, dataVersion]
  )

  const openEmployeeRecord = employee => {
    navigate(`/employee/${encodeURIComponent(employee.kronos_id || employee.id)}`)
  }

  // Stars moved to the recognition row below, beside the other three
  // programme figures.
  const tiles = [
    { label: t('managerHome.onRoster'), value: roster.length },
    { label: t('managerHome.markedToday'), value: markedToday },
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

        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
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

      <YourKitchens
        locationIds={locationIds}
        activeId={locationId}
        onChoose={onLocationChange}
        dataVersion={dataVersion}
      />

      <YourRecognition employeeId={employeeId} />

      <SchoolDashboardInsights
        activeInsight={activeInsight}
        onInsightChange={setActiveInsight}
        onEmployeeSelect={openEmployeeRecord}
        monthExceptions={monthExceptions}
        {...schoolInsights}
      />

      {canEditRecognition && <RecognitionMetrics tiles={recognitionTiles} />}

      <HrFollowUpPanel
        flaggedEmployees={flaggedEmployees}
        onEmployeeSelect={openEmployeeRecord}
        showLocation={false}
      />

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

// The kitchens this login covers, when it covers more than one.
//
// Liz, 2026-10-26: the picker in the top bar was not enough — "on the
// dashboard, can you make this clear and list the schools like we do on the
// admin login page?" So the same shape as the district's Locations grid: a
// card per school with its headcount, and the one being worked in marked.
//
// Choosing a card re-scopes the whole dashboard rather than navigating
// away, so the numbers above change under them and it is obvious which
// kitchen they are now in. The Attendance tracker tile below then opens it.
function YourKitchens({ locationIds, activeId, onChoose, dataVersion }) {
  const kitchens = useMemo(
    () => (Array.isArray(locationIds) ? locationIds : [])
      .map(id => ({
        id,
        name: LOCATION_MAP[id]?.name || id,
        staff: getRosterForLocation(id).length,
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    [locationIds, dataVersion]
  )

  if (!onChoose || kitchens.length < 2) return null

  const current = kitchens.find(kitchen => kitchen.id === activeId)

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-600">Your schools</p>
        <p className="text-xs text-gray-500">
          You cover {kitchens.length} kitchens · tap one to switch
        </p>
      </div>
      <h2 className="mt-1 text-lg font-bold text-gray-900">
        {current ? `Working in ${current.name}` : 'Choose a school'}
      </h2>

      {/* One row of pills rather than a card each. Liz, 2026-10-26: a card
          grid read well for the manager covering two or three, and became
          five rows of boxes for the one covering all fifteen. The same
          control, a quarter of the height, and it still scales down. */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {kitchens.map(kitchen => {
          const active = kitchen.id === activeId
          return (
            <button
              key={kitchen.id}
              type="button"
              onClick={() => onChoose(kitchen.id)}
              aria-current={active ? 'true' : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-brand-300 hover:bg-brand-50'
              }`}
            >
              {kitchen.name}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
              }`}>
                {kitchen.staff}
              </span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-[11px] text-gray-400">
        The number is how many people are on that roster. Everything on this page, the attendance tracker and
        the All-Star board follow your choice.
      </p>
    </section>
  )
}
