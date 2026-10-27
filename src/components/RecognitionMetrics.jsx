// The four recognition figures and what opens under them.
//
// Liz, 2026-10-26: the district dashboard and a manager's dashboard should
// differ by which buildings they cover and nothing else, so the same row
// serves both. The caller passes the buildings in scope; an empty list
// means the whole district.

import { Link } from 'react-router-dom'
import { useState } from 'react'
import { LOCATION_MAP } from '../data/locations.js'
import { getEmployeeByKey } from '../data/employeeLocations.js'
import { useProgramTerms } from './useProgramTerms.js'
import MetricTile from './MetricTile.jsx'
import {
  RECOGNITION_TYPE_MAP,
  aceBucksInSchoolYear,
  dailyStarsInMonth,
  getAllRecognitions,
  recognitionsOfTypeInSchoolYear,
  schoolYearStartFor,
} from '../data/recognitionStore.js'

// 'T00:00:00' keeps a date key in local time. Parsed bare it would be UTC
// midnight and render as the day before.
function formatDateKey(dateKey) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// Stars by the month, the other three by the school year. Stars are the
// daily rhythm, where a running total says nothing about how this month is
// going; the other three are rare enough that a month of them would usually
// read nought.
export function recognitionTilesFor({ locationIds = [], today = new Date() } = {}) {
  const records = getAllRecognitions()
  const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const monthName = today.toLocaleDateString('en-US', { month: 'long' })
  const startYear = schoolYearStartFor(today)
  const schoolYearLabel = `${startYear}–${String(startYear + 1).slice(2)}`

  return [
    {
      id: 'stars',
      label: `Stars in ${monthName}`,
      period: `${monthName} ${today.getFullYear()}`,
      records: dailyStarsInMonth(records, monthKey, locationIds),
    },
    {
      id: 'ace-buck',
      label: 'ACE Bucks',
      period: schoolYearLabel,
      records: aceBucksInSchoolYear(records, startYear, locationIds),
    },
    {
      id: 'shooting-star',
      label: 'Shooting Star Nominations',
      period: schoolYearLabel,
      records: recognitionsOfTypeInSchoolYear(records, 'shooting-star', startYear, locationIds),
    },
    {
      id: 'star-shout-out',
      label: 'Warren Star Shout-Outs',
      period: schoolYearLabel,
      records: recognitionsOfTypeInSchoolYear(records, 'star-shout-out', startYear, locationIds),
    },
  ]
}

export default function RecognitionMetrics({ tiles }) {
  const [open, setOpen] = useState(null)
  const openTile = tiles.find(tile => tile.id === open) || null

  return (
    <>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {tiles.map(tile => (
          <MetricTile
            key={tile.id}
            label={tile.label}
            description={tile.period}
            count={tile.records.length}
            expanded={open === tile.id}
            onToggle={() => setOpen(current => (current === tile.id ? null : tile.id))}
            controls="recognition-drilldown"
          />
        ))}
      </div>
      {openTile && <RecognitionDrilldown id="recognition-drilldown" tile={openTile} />}
    </>
  )
}

// What opens under a recognition tile.
//
// Deliberately separate from InsightDrilldown, which is built around an
// employee and the dates attached to them. These rows are built around a
// recognition record: one award, one date, one reason. The two were nearly
// merged and the merged version needed a branch in every field, which is
// how a list quietly starts showing the wrong thing.
//
// The record carries an employee id rather than a name, so names are looked
// up here. An award for somebody since removed from the roster still shows
// — it happened, and dropping the row would make the count look wrong.
function RecognitionDrilldown({ id, tile }) {
  const term = useProgramTerms()
  const records = tile.records

  return (
    <section id={id} className="bg-white rounded-xl border border-brand-200 p-5 mb-8" aria-live="polite">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-gray-800">{tile.label} · {tile.period}</h2>
        <span className="text-xs font-medium text-gray-400">{records.length} record{records.length === 1 ? '' : 's'}</span>
      </div>

      {records.length === 0 ? (
        <p className="text-sm text-gray-400 py-3">Nothing recorded for this period yet.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {records.map(record => {
            const employee = getEmployeeByKey(record.employeeId)
            const name = employee
              ? `${employee.first_name} ${employee.last_name}`
              : `Employee ${record.employeeId}`
            const school = LOCATION_MAP[record.locationId]?.name || record.locationId || 'No school recorded'
            const reasons = (Array.isArray(record.criteria) ? record.criteria : [])
              .map(criterion => term.reason(criterion))
              .filter(Boolean)

            return (
              <div key={record.id} className="py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1.5 sm:gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {school}
                    {record.recognizedBy ? ` · from ${record.recognizedBy}` : ''}
                    {record.sourceName ? ` · ${record.sourceName}` : ''}
                  </p>
                  {reasons.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {reasons.map(reason => (
                        <span key={reason} className="text-[10px] font-medium bg-brand-50 text-brand-700 border border-brand-200 rounded px-1.5 py-0.5">
                          {reason}
                        </span>
                      ))}
                    </div>
                  )}
                  {record.note && <p className="text-xs text-gray-500 mt-1">{record.note}</p>}
                </div>
                <div className="sm:text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-brand-700">{formatDateKey(record.date)}</p>
                  <p className="text-xs text-gray-400">
                    {term.recognitionLabel(record.type, RECOGNITION_TYPE_MAP[record.type]?.shortLabel || record.type)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

