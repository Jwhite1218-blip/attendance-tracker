// The All-Star recognition export.
//
// Liz, 2026-10-26: "custom report options here for all All-Star Recognition
// awards, to be able to run by building, by award type, by month to be able
// to export."
//
// Built to match the Custom Employee Report next to it on the Reports hub —
// same tick boxes, same preview table, same Export CSV button in the same
// corner — because the two are the same job on different records and
// learning one should teach you the other.
//
// All the filtering lives in recognitionReports.js, where it is tested
// without a browser. This file is the form.
//
// Jon, 2026-11-11: counts and rankings — by person, by building, by who
// submitted — as views of the same filtered records. Only for district
// administrators, the tier that can open Settings. The leaderboards came off
// the screens everybody works from that day because recognition had become
// a contest; the people who run the programme still need the numbers, and
// the administrators giving the most stars do not need a ranking of it.
// That is a choice about what to show, not a secret: every admin session
// already receives these records, and the flat list names who gave each one.

import { useMemo, useState } from 'react'
import { useAuth } from '../components/PinGate.jsx'
import { LOCATIONS } from '../data/locations.js'
import { getEmployeeByKey, getEmployeesWithEffectiveLocations } from '../data/employeeLocations.js'
import { getAllRecognitions, schoolYearStartFor } from '../data/recognitionStore.js'
import { reportToCsv } from '../data/customReports.js'
import { hasLizAdminAccess } from '../data/futureTools.js'
import {
  RECOGNITION_COUNT_VIEWS,
  buildRecognitionCountsReport,
  buildRecognitionReport,
  recognitionReportFilename,
  recognitionReportMonths,
  recognitionReportTypes,
} from '../data/recognitionReports.js'

function downloadCsv(report, filename) {
  // The BOM is what makes Excel read the accented names as UTF-8 rather
  // than mangling them, same as the employee report.
  const csv = `﻿${reportToCsv(report)}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export default function RecognitionReport() {
  const access = useAuth()
  const { dataVersion } = access
  const seesCounts = hasLizAdminAccess(access)
  const records = useMemo(() => getAllRecognitions(), [dataVersion])
  const startYear = useMemo(() => schoolYearStartFor(new Date()), [])
  const schoolYearLabel = `${startYear}–${String(startYear + 1).slice(2)}`

  // Only buildings that have something to report, plus a bucket for awards
  // whose building is no longer in the list, so a filter can never hide a
  // record with no way to find it again.
  const reportLocations = useMemo(() => {
    const seen = new Set(records.map(record => String(record.locationId || '')))
    const named = LOCATIONS.filter(location => seen.has(location.id))
    const known = new Set(named.map(location => location.id))
    const strays = [...seen].filter(id => id && !known.has(id))
    return [
      ...named,
      ...strays.map(id => ({ id, name: id, sort: 998 })),
    ]
  }, [records])

  const awardTypes = useMemo(() => recognitionReportTypes(), [])
  const months = useMemo(() => recognitionReportMonths(startYear), [startYear])

  const [selectedLocations, setSelectedLocations] = useState(() => reportLocations.map(location => location.id))
  const [selectedTypes, setSelectedTypes] = useState(() => awardTypes.map(type => type.id))
  const [monthKey, setMonthKey] = useState('')

  // 'records' is the flat list everybody with this report sees; the count
  // views exist only for district administrators. Each count view keeps its
  // own column to rank by, so switching views does not lose a sort.
  const [view, setView] = useState('records')
  const [sortByView, setSortByView] = useState({})
  const activeView = seesCounts ? view : 'records'

  // How many people work in each building now, for the per-head and
  // coverage columns of the building view.
  const staffByLocation = useMemo(() => {
    const counts = {}
    for (const employee of getEmployeesWithEffectiveLocations()) {
      const locationId = String(employee.location || '')
      if (locationId) counts[locationId] = (counts[locationId] || 0) + 1
    }
    return counts
  }, [dataVersion])

  const options = { startYear, locationIds: selectedLocations, types: selectedTypes, monthKey }
  const report = useMemo(
    () => (activeView === 'records'
      ? buildRecognitionReport(records, getEmployeeByKey, options)
      : buildRecognitionCountsReport(
        records,
        { resolveEmployee: getEmployeeByKey, staffByLocation },
        options,
        { view: activeView, sortBy: sortByView[activeView] }
      )),
    [records, selectedLocations, selectedTypes, monthKey, startYear, activeView, sortByView, staffByLocation]
  )
  const countsView = activeView !== 'records'

  const toggle = (setter, value) => setter(current => (
    current.includes(value) ? current.filter(item => item !== value) : [...current, value]
  ))

  const nothingChosen = selectedLocations.length === 0 || selectedTypes.length === 0
  const canExport = report.rows.length > 0
  const periodLabel = monthKey
    ? months.find(month => month.key === monthKey)?.label || monthKey
    : `${schoolYearLabel} school year`
  const rowUnits = {
    records: ['recognition', 'recognitions'],
    person: ['person', 'people'],
    building: ['building', 'buildings'],
    submitter: ['submitter', 'submitters'],
  }[activeView]
  const rankedBy = report.columns?.find(column => column.id === report.sortBy)?.label.toLowerCase()
  const previewSummary = [
    `${report.rows.length} ${rowUnits[report.rows.length === 1 ? 0 : 1]}`,
    periodLabel,
    countsView && `ranked by ${rankedBy} — choose a column heading to rank by it instead`,
  ].filter(Boolean).join(' · ')

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">All-Star Recognition Report</h1>
          <p className="text-sm text-charcoal-200 mt-1">
            Every recognition given, by building, by award and by month. Preview it here, then export a CSV that opens in Excel.
            {seesCounts && ' Counts and rankings by person, building and who submitted them are below.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => downloadCsv(report, recognitionReportFilename(options, activeView))}
          disabled={!canExport}
          className="self-start px-4 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Export CSV for Excel
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <section className="bg-white rounded-xl border border-gray-200 p-5" aria-labelledby="recognition-report-schools">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="recognition-report-schools" className="text-sm font-semibold text-gray-800">Buildings</h2>
              <p className="text-xs text-gray-400 mt-1">One school, several, or the whole district.</p>
            </div>
            <span className="text-xs font-semibold text-brand-700">{selectedLocations.length} selected</span>
          </div>
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={() => setSelectedLocations(reportLocations.map(location => location.id))} className="text-xs font-semibold text-brand-600 hover:text-brand-700">Select all</button>
            <span className="text-gray-300">·</span>
            <button type="button" onClick={() => setSelectedLocations([])} className="text-xs font-semibold text-gray-500 hover:text-gray-700">Clear</button>
          </div>
          <div className="grid grid-cols-1 gap-2 mt-4 max-h-72 overflow-y-auto pr-1">
            {reportLocations.length === 0 && (
              <p className="text-sm text-gray-400">No recognition has been recorded yet.</p>
            )}
            {reportLocations.map(location => {
              const count = records.filter(record => String(record.locationId) === location.id).length
              return (
                <label key={location.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selectedLocations.includes(location.id)}
                    onChange={() => toggle(setSelectedLocations, location.id)}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="min-w-0 flex-1 text-sm text-gray-700 truncate">{location.name}</span>
                  <span className="text-xs text-gray-400">{count}</span>
                </label>
              )
            })}
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-5" aria-labelledby="recognition-report-types">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="recognition-report-types" className="text-sm font-semibold text-gray-800">Award types</h2>
              <p className="text-xs text-gray-400 mt-1">Stars, nominations, shout-outs, Coach Bucks.</p>
            </div>
            <span className="text-xs font-semibold text-brand-700">{selectedTypes.length} selected</span>
          </div>
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={() => setSelectedTypes(awardTypes.map(type => type.id))} className="text-xs font-semibold text-brand-600 hover:text-brand-700">Select all</button>
            <span className="text-gray-300">·</span>
            <button type="button" onClick={() => setSelectedTypes([])} className="text-xs font-semibold text-gray-500 hover:text-gray-700">Clear</button>
          </div>
          <div className="grid grid-cols-1 gap-2 mt-4">
            {awardTypes.map(type => (
              <label key={type.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selectedTypes.includes(type.id)}
                  onChange={() => toggle(setSelectedTypes, type.id)}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm text-gray-700">{type.label}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-5" aria-labelledby="recognition-report-month">
          <h2 id="recognition-report-month" className="text-sm font-semibold text-gray-800">Month</h2>
          <p className="text-xs text-gray-400 mt-1">
            One month, or the whole {schoolYearLabel} school year. A report never crosses school years —
            an award from last June belongs to last year&apos;s programme.
          </p>
          <select
            value={monthKey}
            onChange={event => setMonthKey(event.target.value)}
            className="mt-4 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700"
          >
            <option value="">Whole {schoolYearLabel} school year</option>
            {months.map(month => (
              <option key={month.key} value={month.key}>{month.label}</option>
            ))}
          </select>
        </section>
      </div>

      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden" aria-labelledby="recognition-report-preview">
        {seesCounts && (
          <div className="flex flex-wrap gap-1 border-b border-gray-200 bg-gray-50 px-3 pt-3 sm:px-4">
            {[{ id: 'records', label: 'Every recognition' }, ...RECOGNITION_COUNT_VIEWS].map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                aria-current={activeView === item.id ? 'true' : undefined}
                className={`rounded-t-lg px-4 py-2.5 text-xs font-semibold transition-colors ${
                  activeView === item.id
                    ? 'border border-b-white border-gray-200 bg-white text-brand-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
        <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 id="recognition-report-preview" className="text-sm font-semibold text-gray-800">Report Preview</h2>
            <p className="text-xs text-gray-400 mt-1">{previewSummary}</p>
          </div>
          {nothingChosen && <p className="text-xs font-medium text-amber-600">Choose at least one building and one award type.</p>}
        </div>

        {canExport ? (
          <div className="overflow-x-auto max-h-[34rem]">
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr className="border-b border-gray-200">
                  {report.columns.map(column => {
                    // In a count view every number except the rank itself
                    // can be ranked by; the flat list has no such columns.
                    const sortable = countsView && column.numeric && column.id !== 'rank'
                    const sorted = sortable && report.sortBy === column.id
                    return (
                      <th
                        key={column.id}
                        aria-sort={sorted ? 'descending' : undefined}
                        className={`text-xs font-medium uppercase tracking-wide px-4 py-3 whitespace-nowrap ${column.numeric ? 'text-right' : 'text-left'} ${sorted ? 'text-brand-700' : 'text-gray-500'}`}
                      >
                        {sortable ? (
                          <button
                            type="button"
                            onClick={() => setSortByView(current => ({ ...current, [activeView]: column.id }))}
                            className="uppercase tracking-wide hover:text-brand-700"
                          >
                            {column.label}{sorted ? ' ▼' : ''}
                          </button>
                        ) : column.label}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row, index) => (
                  <tr key={`${row.date || row.rank}-${row.employee || row.school || row.submitter}-${index}`} className="border-b border-gray-100 even:bg-gray-50/40">
                    {report.columns.map(column => {
                      const value = row[column.id]
                      return (
                        <td
                          key={column.id}
                          className={`text-sm px-4 py-2.5 ${column.numeric ? 'text-right tabular-nums' : ''} ${column.id === 'rank' ? 'font-semibold text-gray-900' : 'text-gray-700'}`}
                        >
                          {value === '' || value == null ? '—' : value}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400 px-5 py-10 text-center">
            {nothingChosen ? 'The report preview will appear here.' : 'Nothing matches those filters.'}
          </p>
        )}
      </section>
    </div>
  )
}
