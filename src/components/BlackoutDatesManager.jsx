import { useState } from 'react'
import { saveBlackoutDate } from '../data/blackoutDates.js'

export default function BlackoutDatesManager({ onChange }) {
  const [label, setLabel] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = event => {
    event.preventDefault()
    try {
      const form = new FormData(event.currentTarget)
      const dates = saveBlackoutDate(form.get('date'), label)
      onChange?.(dates)
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
          <h2 className="text-sm font-semibold text-gray-700">Manage Blackout Dates</h2>
          <p className="text-xs text-gray-400 mt-1">Admin only. Add a closure here; review and remove it from the calendar below.</p>
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
    </div>
  )
}
