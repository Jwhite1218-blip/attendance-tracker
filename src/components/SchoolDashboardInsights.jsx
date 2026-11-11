// The school overview on a manager's dashboard: birthdays, upcoming requested
// time off, and who has an attendance mark today.
//
// Liz, 2026-11-11: birthdays and "who's marked today" are lists, not counts
// behind a dropdown. A manager should see the names without a click. Time
// off stays a count that opens, the same tile as before. The district
// dashboard keeps its own tiles and is not this component.
import MetricTile from './MetricTile.jsx'
import InsightDrilldown from './InsightDrilldown.jsx'
import { CODE_MAP } from '../data/attendanceCodes.js'
import { useLanguage } from './LanguageProvider.jsx'
import { useProgramTerms } from './useProgramTerms.js'

function personName(employee) {
  return `${employee?.first_name || ''} ${employee?.last_name || ''}`.trim()
}

export default function SchoolDashboardInsights({
  activeInsight,
  birthdays,
  markedToday = [],
  monthName,
  onEmployeeSelect,
  onInsightChange,
  requestedTimeOff,
}) {
  const { t, formatDate } = useLanguage()
  const today = new Date()
  const monthLabel = formatDate(today, { month: 'long' })
  const timeOffOpen = activeInsight === 'time-off'

  return (
    <section aria-labelledby="school-overview-heading">
      <div className="mb-3">
        <h2 id="school-overview-heading" className="text-base font-semibold text-white">School Overview</h2>
        <p className="text-xs text-charcoal-200 mt-1">Current milestones and upcoming requested time off for this school.</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-3">
        <NameListCard
          title={t('managerHome.birthdaysTitle', { month: monthLabel })}
          empty={t('managerHome.birthdaysEmpty')}
          items={birthdays}
          onEmployeeSelect={onEmployeeSelect}
          detail={item => formatDate(new Date(today.getFullYear(), today.getMonth(), item.day), {
            month: 'long',
            day: 'numeric',
          })}
        />

        <MetricTile
          label="Upcoming Requested Time Off"
          description="Approved full and half days from today forward"
          count={requestedTimeOff.length}
          expanded={timeOffOpen}
          onToggle={() => onInsightChange(timeOffOpen ? null : 'time-off')}
          controls="school-insight-details"
        />

        <NameListCard
          title={t('managerHome.markedTodayTitle')}
          description={t('managerHome.markedTodayHint')}
          empty={t('managerHome.markedTodayEmpty')}
          items={markedToday}
          onEmployeeSelect={onEmployeeSelect}
          detail={item => <AttendanceMark item={item} />}
        />
      </div>

      {timeOffOpen && (
        <div className="mt-3">
          <InsightDrilldown
            id="school-insight-details"
            type="time-off"
            title="Upcoming Requested Time Off"
            monthName={monthName}
            items={requestedTimeOff}
            onEmployeeSelect={onEmployeeSelect}
          />
        </div>
      )}
    </section>
  )
}

function NameListCard({ title, description, empty, items, detail, onEmployeeSelect }) {
  const rows = Array.isArray(items) ? items : []

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-5 text-left">
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      {description && <p className="mt-1 text-xs text-gray-400">{description}</p>}
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-gray-100">
          {rows.map(item => {
            const employee = item.employee
            const key = `${employee?.kronos_id || employee?.id}-${item.day || item.code || ''}`
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => onEmployeeSelect?.(employee)}
                  className="flex w-full items-center justify-between gap-3 py-2 text-left"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-gray-800">{personName(employee)}</span>
                    {item.note && <span className="mt-0.5 block text-xs text-gray-500">{item.note}</span>}
                  </span>
                  <span className="flex-none text-sm font-semibold text-brand-700">{detail(item)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </article>
  )
}

function AttendanceMark({ item }) {
  const term = useProgramTerms()
  const known = CODE_MAP[item.code]
  const short = known?.shortLabel || item.code
  const full = term.codeLabel(item.code, known?.label || item.code)
  return (
    <span
      className="inline-flex rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-800"
      title={full}
    >
      {short}
    </span>
  )
}
