import { useMemo } from 'react'
import { getEmployeesWithEffectiveLocations } from '../data/employeeLocations.js'
import { buildDailyReportRows, getTodayDateKey } from '../data/dailyReport.js'
import { useAuth } from '../components/PinGate.jsx'

export default function DailyReport() {
  const { dataVersion } = useAuth()
  const today = useMemo(() => new Date(), [])
  const dateKey = getTodayDateKey(today)
  const employees = useMemo(() => getEmployeesWithEffectiveLocations(), [dataVersion])
  const rows = useMemo(() => buildDailyReportRows(employees, dateKey), [employees, dateKey])
  const dateLabel = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const locationCount = new Set(rows.map(row => row.locationId)).size

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="print:hidden flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Daily Attendance Report</h1>
          <p className="text-sm text-charcoal-200 mt-1">{dateLabel} · Same content as the automated 5pm email.</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="self-start px-4 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700"
        >
          Print report
        </button>
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
