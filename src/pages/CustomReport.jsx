import { useMemo, useState } from 'react'
import { LOCATIONS } from '../data/locations.js'
import { getEmployeesWithEffectiveLocations } from '../data/employeeLocations.js'
import {
  buildEmployeeReport,
  EMPLOYEE_REPORT_FIELDS,
  filterEmployeesByLocations,
  reportToCsv,
  summarizeTShirtSizes,
} from '../data/customReports.js'
import { useAuth } from '../components/PinGate.jsx'
import { hasLizAdminAccess } from '../data/futureTools.js'

const DEFAULT_FIELDS = ['employee_id', 'first_name', 'last_name', 'school', 'position']

function downloadCsv(report) {
  const csv = `\ufeff${reportToCsv(report)}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `employee-report-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export default function CustomReport() {
  const access = useAuth()
  const { dataVersion } = access
  const lizAdminAccess = hasLizAdminAccess(access)
  const availableFields = useMemo(
    () => EMPLOYEE_REPORT_FIELDS.filter(field => lizAdminAccess || field.id !== 't_shirt_size'),
    [lizAdminAccess]
  )
  const employees = useMemo(() => getEmployeesWithEffectiveLocations(), [dataVersion])
  const reportLocations = useMemo(() => {
    const named = LOCATIONS.filter(location => employees.some(employee => employee.location === location.id))
    const hasUnassigned = employees.some(employee => !employee.location)
    return hasUnassigned
      ? [...named, { id: '', name: 'Unassigned (no school on file)', sort: 999 }]
      : named
  }, [employees])
  const [selectedLocations, setSelectedLocations] = useState(() => reportLocations.map(location => location.id))
  const [selectedFields, setSelectedFields] = useState(() => (
    lizAdminAccess ? [...DEFAULT_FIELDS, 't_shirt_size'] : DEFAULT_FIELDS
  ))

  const selectedEmployees = useMemo(
    () => filterEmployeesByLocations(employees, selectedLocations),
    [employees, selectedLocations]
  )
  const report = useMemo(
    () => buildEmployeeReport(employees, selectedLocations, selectedFields),
    [employees, selectedFields, selectedLocations]
  )
  const shirtSummary = useMemo(() => summarizeTShirtSizes(selectedEmployees), [selectedEmployees])

  const toggleLocation = locationId => {
    setSelectedLocations(current => current.includes(locationId)
      ? current.filter(id => id !== locationId)
      : [...current, locationId])
  }

  const toggleField = fieldId => {
    setSelectedFields(current => current.includes(fieldId)
      ? current.filter(id => id !== fieldId)
      : [...current, fieldId])
  }

  const canExport = report.rows.length > 0 && report.columns.length > 0

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Custom Employee Report</h1>
          <p className="text-sm text-charcoal-200 mt-1">Choose schools and employee fields, preview the results, then export a CSV that opens in Excel.</p>
        </div>
        <button
          type="button"
          onClick={() => downloadCsv(report)}
          disabled={!canExport}
          className="self-start px-4 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Export CSV for Excel
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <section className="bg-white rounded-xl border border-gray-200 p-5" aria-labelledby="report-schools-heading">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="report-schools-heading" className="text-sm font-semibold text-gray-800">Schools</h2>
              <p className="text-xs text-gray-400 mt-1">Select one school, several schools, or the whole district.</p>
            </div>
            <span className="text-xs font-semibold text-brand-700">{selectedLocations.length} selected</span>
          </div>
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={() => setSelectedLocations(reportLocations.map(location => location.id))} className="text-xs font-semibold text-brand-600 hover:text-brand-700">Select all</button>
            <span className="text-gray-300">·</span>
            <button type="button" onClick={() => setSelectedLocations([])} className="text-xs font-semibold text-gray-500 hover:text-gray-700">Clear</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 max-h-72 overflow-y-auto pr-1">
            {reportLocations.map(location => {
              const count = employees.filter(employee => employee.location === location.id).length
              return (
                <label key={location.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selectedLocations.includes(location.id)}
                    onChange={() => toggleLocation(location.id)}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="min-w-0 flex-1 text-sm text-gray-700 truncate">{location.name}</span>
                  <span className="text-xs text-gray-400">{count}</span>
                </label>
              )
            })}
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-5" aria-labelledby="report-fields-heading">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="report-fields-heading" className="text-sm font-semibold text-gray-800">Employee fields</h2>
              <p className="text-xs text-gray-400 mt-1">Only checked fields appear in the preview and exported file.</p>
            </div>
            <span className="text-xs font-semibold text-brand-700">{selectedFields.length} selected</span>
          </div>
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={() => setSelectedFields(availableFields.map(field => field.id))} className="text-xs font-semibold text-brand-600 hover:text-brand-700">Select all</button>
            <span className="text-gray-300">·</span>
            <button type="button" onClick={() => setSelectedFields([])} className="text-xs font-semibold text-gray-500 hover:text-gray-700">Clear</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
            {availableFields.map(field => (
              <label key={field.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selectedFields.includes(field.id)}
                  onChange={() => toggleField(field.id)}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm text-gray-700">{field.label}</span>
              </label>
            ))}
          </div>
        </section>
      </div>

      {lizAdminAccess && selectedFields.includes('t_shirt_size') && selectedEmployees.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6" aria-labelledby="shirt-summary-heading">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 id="shirt-summary-heading" className="text-sm font-semibold text-gray-800">T-shirt Order Summary</h2>
              <p className="text-xs text-gray-400 mt-1">Totals across the currently selected schools.</p>
            </div>
            <span className="text-xs font-semibold text-gray-500">{selectedEmployees.length} employees</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            {shirtSummary.map(item => (
              <div key={item.size} className={`rounded-lg border px-3 py-2 ${item.size === 'Not provided' ? 'border-amber-200 bg-amber-50' : 'border-brand-100 bg-brand-50'}`}>
                <span className="text-xs font-semibold text-gray-600">{item.size}</span>
                <span className="ml-2 text-base font-bold text-gray-900">{item.count}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden" aria-labelledby="report-preview-heading">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 id="report-preview-heading" className="text-sm font-semibold text-gray-800">Report Preview</h2>
            <p className="text-xs text-gray-400 mt-1">{report.rows.length} employee{report.rows.length === 1 ? '' : 's'} across {selectedLocations.length} school{selectedLocations.length === 1 ? '' : 's'}.</p>
          </div>
          {!canExport && <p className="text-xs font-medium text-amber-600">Choose at least one school and one field.</p>}
        </div>

        {canExport ? (
          <div className="overflow-x-auto max-h-[34rem]">
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr className="border-b border-gray-200">
                  {report.columns.map(column => (
                    <th key={column.id} className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3 whitespace-nowrap">{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row, index) => (
                  <tr key={`${row.employee_id || 'employee'}-${index}`} className="border-b border-gray-100 even:bg-gray-50/40">
                    {report.columns.map(column => (
                      <td key={column.id} className="text-sm text-gray-700 px-4 py-2.5 whitespace-nowrap">{row[column.id] || '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400 px-5 py-10 text-center">The report preview will appear here.</p>
        )}
      </section>
    </div>
  )
}
