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

import { useMemo, useState } from 'react'
import { useAuth } from '../components/PinGate.jsx'
import { LOCATIONS } from '../data/locations.js'
import { getEmployeeByKey } from '../data/employeeLocations.js'
import { getAllRecognitions, schoolYearStartFor } from '../data/recognitionStore.js'
import { reportToCsv } from '../data/customReports.js'
import {
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
  const { dataVersion } = useAuth()
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

  const options = { startYear, locationIds: selectedLocations, types: selectedTypes, monthKey }
  const report = useMemo(
    () => buildRecognitionReport(records, getEmployeeByKey, options),
    [records, selectedLocations, selectedTypes, monthKey, startYear]
  )

  const toggle = (setter, value) => setter(current => (
    current.includes(value) ? current.filter(item => item !== value) : [...current, value]
  ))

  const nothingChosen = selectedLocations.length === 0 || selectedTypes.length === 0
  const canExport = report.rows.length > 0
  const periodLabel = monthKey
    ? months.find(month => month.key === monthKey)?.label || monthKey
    : `${schoolYearLabel} school year`

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">All-Star Recognition Report</h1>
          <p className="text-sm text-charcoal-200 mt-1">
            Every recognition given, by building, by award and by month. Preview it here, then export a CSV that opens in Excel.
          </p>
        </div>
        <button
          type="button"
          onClick={() => downloadCsv(report, recognitionReportFilename(options))}
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
        <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 id="recognition-report-preview" className="text-sm font-semibold text-gray-800">Report Preview</h2>
            <p className="text-xs text-gray-400 mt-1">
              {report.rows.length} recognition{report.rows.length === 1 ? '' : 's'} · {periodLabel}
            </p>
          </div>
          {nothingChosen && <p className="text-xs font-medium text-amber-600">Choose at least one building and one award type.</p>}
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
                  <tr key={`${row.date}-${row.employee}-${index}`} className="border-b border-gray-100 even:bg-gray-50/40">
                    {report.columns.map(column => (
                      <td key={column.id} className="text-sm text-gray-700 px-4 py-2.5">{row[column.id] || '—'}</td>
                    ))}
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
