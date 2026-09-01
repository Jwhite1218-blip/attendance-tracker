import { useMemo, useState } from 'react'
import { getEmployeesWithEffectiveLocations } from '../data/employeeLocations.js'
import { buildDailyReportRows, buildDailyReportSheetRows, getTodayDateKey } from '../data/dailyReport.js'
import { downloadWorkbook } from '../lib/exportWorkbook.js'
import { useAuth } from '../components/PinGate.jsx'

export default function DailyReport() {
  const { dataVersion } = useAuth()
  const [exporting, setExporting] = useState(false)
  const today = useMemo(() => new Date(), [])
  const todayKey = getTodayDateKey(today)
  // Any past day can be reviewed — "who was out that day" when nobody was in
  // the app to watch it live. Future days hold no records, so today is the cap.
  const [dateKey, setDateKey] = useState(todayKey)
  const isToday = dateKey === todayKey
  // Inactive staff are included on purpose: this is a record of who was out on
  // a given day, and someone who has since left was still an employee then.
  // It also keeps the page in parity with the 5pm email, whose roster builder
  // (daily-report.mjs effectiveRoster) does not filter on active either.
  const employees = useMemo(() => getEmployeesWithEffectiveLocations({ includeInactive: true }), [dataVersion])
  const rows = useMemo(() => buildDailyReportRows(employees, dateKey), [employees, dateKey])
  const dateLabel = new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const locationCount = new Set(rows.map(row => row.locationId)).size

  const exportReport = async () => {
    setExporting(true)
    try {
      await downloadWorkbook(`attendance-daily-${dateKey}.xlsx`, [{
        name: 'Daily Report',
        rows: buildDailyReportSheetRows(rows),
      }])
    } catch {
      window.alert('Could not build the export. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="print:hidden flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Daily Attendance Report</h1>
          <p className="text-sm text-charcoal-200 mt-1">
            {dateLabel}
            {isToday ? ' · Same content as the automated 5pm email.' : ' · Past date'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label htmlFor="daily-report-date" className="text-xs font-semibold text-charcoal-200 uppercase tracking-wide">
              Report date
            </label>
            <input
              id="daily-report-date"
              type="date"
              value={dateKey}
              max={todayKey}
              onChange={event => setDateKey(event.target.value || todayKey)}
              className="text-sm font-semibold border-2 border-brand-400 rounded-lg px-3 py-1.5 bg-brand-50 text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-300 cursor-pointer"
            />
            {!isToday && (
              <button
                type="button"
                onClick={() => setDateKey(todayKey)}
                className="text-xs font-semibold text-brand-300 underline hover:text-brand-200"
              >
                Back to today
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          <button
            type="button"
            onClick={exportReport}
            disabled={exporting || rows.length === 0}
            className="px-4 py-2.5 rounded-lg border border-charcoal-500 bg-charcoal-700 text-white text-sm font-semibold hover:bg-charcoal-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Export (.xlsx)
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700"
          >
            Print report
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 print:border-0 print:rounded-none print:p-0 print:text-black">
        <div className="hidden print:block mb-4">
          <h1 className="text-xl font-bold">Daily Attendance Report</h1>
          <p className="text-sm">{dateLabel}</p>
        </div>

        <p className="text-sm text-gray-600 print:text-black mb-4">
          <strong>{rows.length}</strong> exception{rows.length === 1 ? '' : 's'} across <strong>{locationCount}</strong> location{locationCount === 1 ? '' : 's'}.
        </p>

        {rows.length === 0 ? (
          <p className="text-sm text-gray-400 print:text-black">No attendance exceptions were recorded for this date.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 print:border-b-2 print:border-black">
                <th className="text-left py-2 pr-3">Location</th>
                <th className="text-left py-2 pr-3">Employee</th>
                <th className="text-left py-2 pr-3">Code</th>
                <th className="text-left py-2">Comment</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-b border-gray-100 print:border-gray-300">
                  <td className="py-2 pr-3 align-top">{row.locationName}</td>
                  <td className="py-2 pr-3 align-top">{row.employeeName}</td>
                  <td className="py-2 pr-3 align-top">
                    <span className="font-bold">{row.code}</span>{' '}
                    <span className="text-gray-500 print:text-black">{row.codeLabel}</span>
                  </td>
                  <td className="py-2 align-top">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
