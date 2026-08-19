import { useState } from 'react'
import { getBlackoutDates, removeBlackoutDate, saveBlackoutDate } from '../data/blackoutDates.js'

function formatDate(dateKey) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function BlackoutDatesManager() {
  const [dates, setDates] = useState(() => getBlackoutDates())
  const [label, setLabel] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = event => {
    event.preventDefault()
    try {
      const form = new FormData(event.currentTarget)
      setDates(saveBlackoutDate(form.get('date'), label))
      event.currentTarget.reset()
      setLabel('')
      setError('')
    } catch (submitError) {
      setError(submitError.message || 'Unable to save this date.')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-lg bg-charcoal-800 text-white flex items-center justify-center text-sm font-bold">×</span>
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Calendar Blackout Dates</h2>
          <p className="text-xs text-gray-400 mt-1">Admin only. Blacked-out dates cannot be marked for attendance.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-[180px_1fr_auto] gap-3 mt-4">
        <label className="block">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</span>
          <input
            name="date"
            type="date"
            onChange={() => setError('')}
            required
            className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Holiday or reason</span>
          <input
            type="text"
            value={label}
            onChange={event => { setLabel(event.target.value); setError('') }}
            placeholder="Example: Labor Day or district closure"
            required
            className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <button type="submit" className="self-end px-4 py-2 rounded-lg bg-charcoal-800 text-white text-sm font-semibold hover:bg-charcoal-700">
          Black out date
        </button>
      </form>

      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

      {dates.length > 0 ? (
        <div className="mt-4 pt-4 border-t border-gray-100 divide-y divide-gray-100">
          {dates.map(item => (
            <div key={item.date} className="py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-5 h-5 rounded bg-charcoal-800 flex-shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{item.label}</p>
                  <p className="text-xs text-gray-400">{formatDate(item.date)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDates(removeBlackoutDate(item.date))}
                className="text-xs font-semibold text-red-600 hover:text-red-700 px-2 py-1"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400 mt-4 pt-4 border-t border-gray-100">No blackout dates scheduled.</p>
      )}
    </div>
  )
}
