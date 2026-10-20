// The four cards at the top of a school's screens: birthdays, service
// birthdays, upcoming requested time off, and this week's exceptions.
//
// Lifted out of LocationView on 2026-10-11 so the manager's Dashboard can
// show the same four. Liz: they "need to show up on the dashboard of the
// school and not just the overview". One copy, so the two can never disagree
// about what a school's month looks like.
import { useProgramTerms } from './useProgramTerms.js'
import { StatusBadge } from './StatusBadge.jsx'
import { CODE_MAP } from '../data/attendanceCodes.js'

// Local, because the parsing matters: 'T00:00:00' keeps a date key in local
// time. Parsed bare it would be UTC midnight and render as the day before.
function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function SchoolDashboardInsights({
  activeInsight,
  birthdays,
  monthName,
  onEmployeeSelect,
  onInsightChange,
  requestedTimeOff,
  weekExceptions,
  weekLabel,
}) {
  const term = useProgramTerms()
  const cards = [
    {
      id: 'birthdays',
      label: `${monthName} Birthdays`,
      count: birthdays.length,
      description: 'Current-month birthdays for this school',
    },
    {
      id: 'time-off',
      label: 'Upcoming RTOs',
      count: requestedTimeOff.length,
      description: 'Full and half requested-time-off days from today forward',
    },
    {
      id: 'exceptions',
      label: 'This Week’s Exceptions',
      count: weekExceptions.length,
      description: `Every marked exception for ${weekLabel}`,
    },
  ]

  const activeItems = activeInsight === 'birthdays'
    ? birthdays
    : activeInsight === 'exceptions'
      ? weekExceptions
      : requestedTimeOff

  const activeTitle = activeInsight === 'birthdays'
    ? `${monthName} Birthdays`
    : activeInsight === 'exceptions'
      ? 'This Week’s Exceptions'
      : 'Upcoming Requested Time Off'

  return (
    <section className="mb-6" aria-labelledby="school-overview-heading">
      <div className="mb-3">
        <h2 id="school-overview-heading" className="text-base font-semibold text-white">School Overview</h2>
        <p className="text-xs text-charcoal-200 mt-1">Current milestones and upcoming requested time off for this school.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cards.map(card => (
          <button
            key={card.id}
            type="button"
            onClick={() => onInsightChange(activeInsight === card.id ? null : card.id)}
            aria-expanded={activeInsight === card.id}
            aria-controls="school-insight-details"
            className={`rounded-xl border bg-white p-4 text-left transition-all hover:border-brand-300 hover:shadow-md ${
              activeInsight === card.id ? 'border-brand-400 ring-2 ring-brand-100' : 'border-gray-200'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">{card.label}</p>
                <p className="text-xs text-gray-400 mt-1">{card.description}</p>
              </div>
              <span className="inline-flex min-w-9 h-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700 text-lg font-bold">
                {card.count}
              </span>
            </div>
            <p className="text-xs font-semibold text-brand-600 mt-3">
              {activeInsight === card.id ? 'Hide details' : 'View details'}
            </p>
          </button>
        ))}
      </div>

      {activeInsight && (
        <div id="school-insight-details" className="mt-3 rounded-xl border border-brand-200 bg-white p-4" aria-live="polite">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h3 className="text-sm font-semibold text-gray-800">{activeTitle}</h3>
            <span className="text-xs font-medium text-gray-400">{activeItems.length} record{activeItems.length === 1 ? '' : 's'}</span>
          </div>

          {activeItems.length === 0 ? (
            <p className="text-sm text-gray-400 py-3">No matching employee records for this school.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {activeItems.map(item => {
                const employee = item.employee
                const employeeKey = employee.kronos_id || employee.id
                return (
                  <div key={`${employeeKey}-${item.dateKey || item.day}-${item.code || ''}`} className="py-3 flex items-center justify-between gap-4">
                    <button
                      type="button"
                      onClick={() => onEmployeeSelect(employee)}
                      className="min-w-0 text-left group"
                    >
                      <p className="text-sm font-semibold text-gray-800 group-hover:text-brand-700">{employee.first_name} {employee.last_name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{employee.position || 'Position not listed'} · Open employee calendar</p>
                      {activeInsight === 'time-off' && item.record.note && (
                        <p className="text-xs text-gray-500 mt-1">{item.record.note}</p>
                      )}
                      {activeInsight === 'exceptions' && item.note && (
                        <p className="text-xs text-gray-500 mt-1">{item.note}</p>
                      )}
                    </button>
                    <div className="text-right flex-shrink-0">
                      {activeInsight === 'birthdays' && <p className="text-sm font-semibold text-brand-700">{monthName} {item.day}</p>}
                      {activeInsight === 'time-off' && (
                        <>
                          <p className="text-sm font-semibold text-brand-700">{formatDate(item.dateKey)}</p>
                          <p className="text-xs text-gray-400">{term.codeLabel(item.record.code, CODE_MAP[item.record.code]?.label || item.record.code)}</p>
                        </>
                      )}
                      {activeInsight === 'exceptions' && (
                        <>
                          <p className="text-sm font-semibold text-brand-700">{formatDate(item.dateKey)}</p>
                          <p className="text-xs text-gray-400">{term.codeLabel(item.code, CODE_MAP[item.code]?.label || item.code)}</p>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
