import { useState } from 'react'
import { saveBlackoutDateRange } from '../data/blackoutDates.js'

export default function BlackoutDatesManager({ onChange }) {
  const [label, setLabel] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState('')

  const dayCount = startDate && endDate && endDate >= startDate
    ? Math.round((new Date(`${endDate}T12:00:00`) - new Date(`${startDate}T12:00:00`)) / 86400000) + 1
    : null

  const handleSubmit = event => {
    event.preventDefault()
    try {
      const dates = saveBlackoutDateRange(startDate, endDate || startDate, label)
      onChange?.(dates)
      setStartDate('')
      setEndDate('')
      setLabel('')
      setError('')
    } catch (submitError) {
      setError(submitError.message || 'Unable to save this date range.')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-lg bg-charcoal-800 text-white flex items-center justify-center text-sm font-bold">×</span>
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Manage Blackout Dates</h2>
          <p className="text-xs text-gray-400 mt-1">Admin only. Block out a single day or a whole range (like summer or winter break) in one go; review and remove entries from the calendar below.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-[160px_160px_1fr_auto] gap-3 mt-4">
        <label className="block">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Start date</span>
          <input
            type="date"
            value={startDate}
            onChange={event => { setStartDate(event.target.value); setError('') }}
            required
            className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">End date <span className="normal-case text-gray-400">(optional)</span></span>
          <input
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={event => { setEndDate(event.target.value); setError('') }}
            placeholder="Same as start"
            className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Holiday or reason</span>
          <input
            type="text"
            value={label}
            onChange={event => { setLabel(event.target.value); setError('') }}
            placeholder="Example: Winter Break or district closure"
            required
            className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <button type="submit" className="self-end px-4 py-2 rounded-lg bg-charcoal-800 text-white text-sm font-semibold hover:bg-charcoal-700 whitespace-nowrap">
          Black out {dayCount && dayCount > 1 ? `${dayCount} days` : 'date'}
        </button>
      </form>

      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  )
}
