import { useEffect, useMemo, useState } from 'react'
import { getBlackoutDates, removeBlackoutDate } from '../data/blackoutDates.js'
import { getCalendarYearMonths, getFiscalYearMonths, formatYearLabel, readCalendarMode, writeCalendarMode } from '../data/fiscalCalendar.js'
import { useAuth } from '../components/PinGate.jsx'
import BlackoutDatesManager from '../components/BlackoutDatesManager.jsx'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function dateKey(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function formatDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function CalendarView() {
  const { canManageBlackouts, dataVersion } = useAuth()
  const [year, setYear] = useState(new Date().getFullYear())
  const [mode, setMode] = useState(readCalendarMode)
  const [blackoutDates, setBlackoutDates] = useState(() => getBlackoutDates())
  const [selectedDate, setSelectedDate] = useState(null)

  useEffect(() => {
    setBlackoutDates(getBlackoutDates())
    setSelectedDate(null)
  }, [dataVersion])

  const setCalendarMode = nextMode => {
    setMode(nextMode)
    writeCalendarMode(nextMode)
  }

  const displayMonths = mode === 'fiscal' ? getFiscalYearMonths(year) : getCalendarYearMonths(year)

  const blackoutMap = useMemo(
    () => Object.fromEntries(blackoutDates.map(item => [item.date, item])),
    [blackoutDates]
  )
  const selectedBlackout = selectedDate ? blackoutMap[selectedDate] : null
  const rangeStart = mode === 'fiscal' ? `${year}-07-01` : `${year}-01-01`
  const rangeEnd = mode === 'fiscal' ? `${year + 1}-06-30` : `${year}-12-31`
  const yearBlackouts = blackoutDates.filter(item => item.date >= rangeStart && item.date <= rangeEnd)

  const refreshBlackouts = dates => {
    setBlackoutDates(dates || getBlackoutDates())
    setSelectedDate(null)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Blackout Calendar</h1>
          <p className="text-sm text-charcoal-200 mt-1">
            District administrators manage unavailable days here; school teams can review them without editing.
          </p>
        </div>
        <div className="flex flex-col items-start sm:items-end gap-2 self-start sm:self-auto">
          <div className="flex items-center rounded-lg border border-charcoal-600 overflow-hidden text-xs font-semibold">
            <button
              type="button"
              onClick={() => setCalendarMode('calendar')}
              className={`px-2.5 py-1.5 ${mode === 'calendar' ? 'bg-brand-600 text-white' : 'bg-charcoal-700 text-charcoal-200 hover:bg-charcoal-600'}`}
            >
              Calendar Year
            </button>
            <button
              type="button"
              onClick={() => setCalendarMode('fiscal')}
              className={`px-2.5 py-1.5 ${mode === 'fiscal' ? 'bg-brand-600 text-white' : 'bg-charcoal-700 text-charcoal-200 hover:bg-charcoal-600'}`}
            >
              School Year (Jul–Jun)
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setYear(value => value - 1); setSelectedDate(null) }}
              aria-label="Previous year"
              className="p-2 rounded-lg border border-charcoal-600 hover:bg-charcoal-600 text-charcoal-200"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-lg font-bold text-white min-w-16 text-center">{formatYearLabel(year, mode)}</span>
            <button
              type="button"
              onClick={() => { setYear(value => value + 1); setSelectedDate(null) }}
              aria-label="Next year"
              className="p-2 rounded-lg border border-charcoal-600 hover:bg-charcoal-600 text-charcoal-200"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {canManageBlackouts && <BlackoutDatesManager onChange={refreshBlackouts} />}

      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">District Blackout Calendar</h2>
            <p className="text-xs text-gray-400 mt-1">Blackout dates are unavailable in every attendance-marking view.</p>
          </div>
          <span className="text-xs font-semibold text-gray-500">{yearBlackouts.length} date{yearBlackouts.length === 1 ? '' : 's'} in {formatYearLabel(year, mode)}</span>
        </div>
      </div>

      {selectedBlackout && (
        <div className="bg-white rounded-xl border border-charcoal-400 p-4 mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-900">{selectedBlackout.label}</p>
            <p className="text-xs text-gray-500 mt-0.5">{formatDate(selectedBlackout.date)}</p>
          </div>
          {canManageBlackouts && (
            <button
              type="button"
              onClick={() => refreshBlackouts(removeBlackoutDate(selectedBlackout.date))}
              className="self-start sm:self-auto px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100"
            >
              Remove blackout date
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {displayMonths.map(({ year: monthYear, monthIdx: monthIndex }) => {
          const monthName = MONTHS[monthIndex]
          const firstWeekday = new Date(monthYear, monthIndex, 1).getDay()
          const daysInMonth = new Date(monthYear, monthIndex + 1, 0).getDate()
          const monthBlackouts = yearBlackouts.filter(item => item.date.startsWith(`${monthYear}-${String(monthIndex + 1).padStart(2, '0')}-`))

          return (
            <section key={`${monthYear}-${monthIndex}`} className="bg-white rounded-xl border border-gray-200 p-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <h2 className="text-sm font-semibold text-gray-900">{monthName}{mode === 'fiscal' ? ` ${monthYear}` : ''}</h2>
                {monthBlackouts.length > 0 && (
                  <span className="text-[10px] font-bold rounded-full bg-charcoal-800 text-white px-2 py-0.5">
                    {monthBlackouts.length} blackout{monthBlackouts.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-7 gap-1 mb-1">
                {WEEKDAYS.map((weekday, index) => (
                  <div key={`${weekday}-${index}`} className="text-center text-[9px] font-medium text-gray-400">{weekday}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstWeekday }).map((_, index) => <div key={`empty-${index}`} />)}
                {Array.from({ length: daysInMonth }).map((_, index) => {
                  const day = index + 1
                  const key = dateKey(monthYear, monthIndex, day)
                  const blackout = blackoutMap[key]
                  const isWeekend = new Date(monthYear, monthIndex, day).getDay() % 6 === 0

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => blackout && setSelectedDate(key)}
                      disabled={!blackout}
                      title={blackout ? `${formatDate(key)} — ${blackout.label}` : undefined}
                      aria-label={blackout ? `${formatDate(key)}: ${blackout.label}` : undefined}
                      className={`aspect-square rounded border text-[10px] font-medium flex items-center justify-center ${
                        blackout
                          ? 'bg-charcoal-800 text-white border-charcoal-800 cursor-pointer hover:ring-2 hover:ring-brand-300'
                          : isWeekend
                            ? 'bg-gray-100 text-gray-400 border-gray-100 cursor-default'
                            : 'bg-white text-gray-600 border-gray-100 cursor-default'
                      } ${selectedDate === key ? 'ring-2 ring-brand-400 ring-offset-1' : ''}`}
                    >
                      {blackout ? '×' : day}
                    </button>
                  )
                })}
              </div>

              {monthBlackouts.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
                  {monthBlackouts.map(item => (
                    <button
                      key={item.date}
                      type="button"
                      onClick={() => setSelectedDate(item.date)}
                      className="w-full flex items-start gap-2 text-left text-xs text-gray-600 hover:text-brand-700"
                    >
                      <span className="w-2.5 h-2.5 rounded-sm bg-charcoal-800 flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <span><strong>{Number(item.date.slice(8, 10))}</strong> · {item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>

      <div className="mt-4 flex items-center justify-center gap-5 text-xs text-charcoal-200">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-100 border border-gray-200" /> Weekend</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-charcoal-800" /> District blackout</span>
      </div>
    </div>
  )
}
