// What opens under a birthday, time-off or exception tile.
//
// Liz, 2026-10-26: one panel for both dashboards. The district page and a
// manager's page each had their own, listing the same three things in the
// same shape, and they had already diverged — the district's rows could not
// be clicked and its empty state said something slightly different.
//
// Every row opens that person's card, on both pages. That was true on a
// manager's page and not on the district's, and there is no reason a
// district administrator should be the one who cannot click through.
import { CODE_MAP } from '../data/attendanceCodes.js'
import { LOCATION_MAP } from '../data/locations.js'
import { useProgramTerms } from './useProgramTerms.js'

// 'T00:00:00' keeps a date key in local time. Parsed bare it would be UTC
// midnight and render as the day before.
function formatDateKey(dateKey) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export default function InsightDrilldown({
  id,
  type,
  title,
  monthName,
  items,
  onEmployeeSelect,
  showLocation = false,
}) {
  const term = useProgramTerms()

  return (
    <section id={id} className="rounded-xl border border-brand-200 bg-white p-5 mb-8" aria-live="polite">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        <span className="text-xs font-medium text-gray-400">
          {items.length} record{items.length === 1 ? '' : 's'}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-gray-400 py-3">Nothing to show here right now.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {items.map(item => {
            const employee = item.employee
            const employeeKey = employee.kronos_id || employee.id
            return (
              <button
                key={`${employeeKey}-${item.dateKey || item.day}-${item.code || ''}`}
                type="button"
                onClick={() => onEmployeeSelect?.(employee)}
                className="w-full py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-4 text-left group"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 group-hover:text-brand-700">
                    {employee.first_name} {employee.last_name}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {showLocation && `${LOCATION_MAP[employee.location]?.name || employee.location || 'No school assigned'} · `}
                    {employee.position || 'Position not listed'}
                  </p>
                  {type === 'time-off' && item.record?.note && (
                    <p className="text-xs text-gray-500 mt-1">{item.record.note}</p>
                  )}
                  {type === 'exceptions' && item.note && (
                    <p className="text-xs text-gray-500 mt-1">{item.note}</p>
                  )}
                </div>
                <div className="sm:text-right flex-shrink-0">
                  {type === 'birthdays' && (
                    <p className="text-sm font-semibold text-brand-700">{monthName} {item.day}</p>
                  )}
                  {type !== 'birthdays' && (
                    <>
                      <p className="text-sm font-semibold text-brand-700">{formatDateKey(item.dateKey)}</p>
                      <p className="text-xs text-gray-400">
                        {type === 'time-off'
                          ? term.codeLabel(item.record.code, CODE_MAP[item.record.code]?.label || item.record.code)
                          : term.codeLabel(item.code, CODE_MAP[item.code]?.label || item.code)}
                      </p>
                    </>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
