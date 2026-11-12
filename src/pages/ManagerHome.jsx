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
//
// Recognition news is first. A star recorded hours later is easy to miss if
// it only shows up in the history, so a personal celebration and this
// kitchen's unprinted Star of the Day cards sit above the rest of the page.
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../components/PinGate.jsx'
import { useLanguage } from '../components/LanguageProvider.jsx'
import { LOCATION_MAP } from '../data/locations.js'
import { getRosterForLocation } from '../data/employeeLocations.js'
import { getAttendanceRecord, readFutureAttendance } from '../data/attendanceStore.js'
import { buildSchoolInsights, peopleMarkedOn } from '../data/dashboardInsights.js'
import SchoolDashboardInsights from '../components/SchoolDashboardInsights.jsx'
import HrFollowUpPanel from '../components/HrFollowUpPanel.jsx'
import YourRecognition from '../components/YourRecognition.jsx'
import RecognitionNotifications from '../components/RecognitionNotifications.jsx'
import RecognitionMetrics, { recognitionTilesFor } from '../components/RecognitionMetrics.jsx'
import ManagerTabs from '../components/ManagerTabs.jsx'
import { attendanceSeverityOf, getAllFlaggedEmployees, splitFlaggedByEmploymentStatus } from '../data/hrFlags.js'
import confetti from '../assets/allstars/confetti.jpg'
import goldStar from '../assets/allstars/star-3d.png'


function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function ManagerHome() {
  const navigate = useNavigate()
  const { locationId, locationIds, onLocationChange, canEditRecognition, dataVersion, employeeId } = useAuth()
  const { t, formatDate } = useLanguage()
  const school = LOCATION_MAP[locationId]
  const today = todayKey()

  const roster = useMemo(
    () => getRosterForLocation(locationId),
    [locationId, dataVersion]
  )

  // Who has an attendance mark today. A blank day is someone who turned up
  // and was not entered, so the list is exceptions, not a headcount of who
  // came in.
  const markedToday = useMemo(
    () => peopleMarkedOn(roster, today, getAttendanceRecord),
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

  // One building's worth of the district's recognition row. The scope is
  // this kitchen, which is the whole difference between the two pages.
  const recognitionTiles = useMemo(
    () => recognitionTilesFor({ locationIds: [locationId], starSpan: 'year' }),
    [locationId, dataVersion]
  )

  const openEmployeeRecord = employee => {
    navigate(`/employee/${encodeURIComponent(employee.kronos_id || employee.id)}`)
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-3 py-5 sm:px-6 sm:py-8">
      <ManagerTabs />

      <YourKitchens
        locationIds={locationIds}
        activeId={locationId}
        onChoose={onLocationChange}
        dataVersion={dataVersion}
      />

      <header
        className="relative overflow-hidden rounded-2xl border border-[#e8c65c]/45 text-white"
        style={{
          backgroundColor: '#14110c',
          backgroundImage: `linear-gradient(115deg, rgba(12,10,8,0.94), rgba(12,10,8,0.78)), url(${confetti})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="flex items-start gap-4 p-5 sm:p-6">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#e8c65c]">
              {t('managerHome.eyebrow')}
            </p>
            <h1 className="all-star-display mt-1 text-3xl uppercase leading-none tracking-wide sm:text-4xl">
              {school?.name || t('managerHome.yourSchool')}
            </h1>
            <p className="all-star-script mt-2 text-2xl text-[#f4d87d]">{t('managerHome.tagline')}</p>
            <p className="mt-1 text-xs text-amber-100/75">{formatDate(today, { dateStyle: 'full' })}</p>
          </div>
          <img src={goldStar} alt="" className="h-16 w-16 flex-none sm:h-20 sm:w-20" />
        </div>
      </header>

      <SchoolDashboardInsights
        onEmployeeSelect={openEmployeeRecord}
        markedToday={markedToday}
        {...schoolInsights}
      >
        {canEditRecognition && <RecognitionMetrics tiles={recognitionTiles} />}
      </SchoolDashboardInsights>

      <RecognitionNotifications
        employeeId={employeeId}
        locationId={locationId}
        canPrint={canEditRecognition}
        dataVersion={dataVersion}
      />

      <YourRecognition employeeId={employeeId} />

      <HrFollowUpPanel
        flaggedEmployees={flaggedEmployees}
        onEmployeeSelect={openEmployeeRecord}
        showLocation={false}
      />

    </div>
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
  const { t } = useLanguage()
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
    <section className="rounded-2xl border border-[#e8c65c]/35 bg-[#1c1812] p-4 text-white sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#e8c65c]">{t('managerHome.yourSchools')}</p>
        <p className="text-xs text-amber-100/70">
          {t('managerHome.kitchenCount', { count: kitchens.length })}
        </p>
      </div>
      <h2 className="mt-1 text-lg font-bold text-[#f8e7b0]">
        {current ? t('managerHome.workingIn', { name: current.name }) : t('managerHome.chooseSchool')}
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
                  ? 'border-[#e8c65c] bg-[#e8c65c] text-[#241703]'
                  : 'border-[#e8c65c]/30 bg-transparent text-amber-50 hover:border-[#e8c65c] hover:bg-[#e8c65c]/10'
              }`}
            >
              {kitchen.name}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                active ? 'bg-[#241703]/15 text-[#241703]' : 'bg-white/10 text-amber-100'
              }`}>
                {kitchen.staff}
              </span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-[11px] text-amber-100/55">
        {t('managerHome.rosterCount')}
      </p>
    </section>
  )
}
