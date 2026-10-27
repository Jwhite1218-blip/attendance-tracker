// The three cards at the top of a school's screens: birthdays, upcoming
// requested time off, and this month's exceptions.
//
// Lifted out of LocationView on 2026-10-11 so the manager's Dashboard can
// show the same three. Liz: they "need to show up on the dashboard of the
// school and not just the overview".
//
// Rebuilt on 2026-10-26 to use the same tile and the same drill-down panel
// as the district dashboard. Before that each page had its own copy of
// both, and they had already drifted — different padding, a different
// empty state, and rows that could be clicked on one page but not the
// other. Liz: the two dashboards should differ by which buildings they
// cover and nothing else.
import MetricTile from './MetricTile.jsx'
import InsightDrilldown from './InsightDrilldown.jsx'

export default function SchoolDashboardInsights({
  activeInsight,
  birthdays,
  monthName,
  monthExceptions,
  onEmployeeSelect,
  onInsightChange,
  requestedTimeOff,
}) {
  // The same three labels and the same three periods the district page
  // uses, so a manager and Liz reading "October Exceptions" are reading
  // the same measure.
  const cards = [
    {
      id: 'birthdays',
      label: `${monthName} Birthdays`,
      count: birthdays.length,
      description: 'All active staff celebrating this month',
      items: birthdays,
    },
    {
      id: 'time-off',
      label: 'Upcoming Requested Time Off',
      count: requestedTimeOff.length,
      description: 'Approved full and half days from today forward',
      items: requestedTimeOff,
    },
    {
      id: 'exceptions',
      label: `${monthName} Exceptions`,
      count: monthExceptions.length,
      description: 'Marked attendance exceptions so far this month',
      items: monthExceptions,
    },
  ]

  const active = cards.find(card => card.id === activeInsight) || null

  return (
    <section aria-labelledby="school-overview-heading">
      <div className="mb-3">
        <h2 id="school-overview-heading" className="text-base font-semibold text-white">School Overview</h2>
        <p className="text-xs text-charcoal-200 mt-1">Current milestones and upcoming requested time off for this school.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        {cards.map(card => (
          <MetricTile
            key={card.id}
            label={card.label}
            description={card.description}
            count={card.count}
            expanded={activeInsight === card.id}
            onToggle={() => onInsightChange(activeInsight === card.id ? null : card.id)}
            controls="school-insight-details"
          />
        ))}
      </div>

      {active && (
        <InsightDrilldown
          id="school-insight-details"
          type={active.id}
          title={active.label}
          monthName={monthName}
          items={active.items}
          onEmployeeSelect={onEmployeeSelect}
        />
      )}
    </section>
  )
}
