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
  dailyStarsInSchoolYear,
  getAllRecognitions,
  recognitionsOfTypeInSchoolYear,
  schoolYearStartFor,
} from '../data/recognitionStore.js'
import { useLanguage } from './LanguageProvider.jsx'

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

// Stars by the month on the district dashboard. On a manager's dashboard
// Liz asked for the school year, the same window as the three tiles beside
// it. `starSpan: 'year'` is that; the default stays the month so the two
// pages do not change together by accident.
export function recognitionTilesFor({ locationIds = [], today = new Date(), starSpan = 'month' } = {}) {
  const records = getAllRecognitions()
  const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const monthName = today.toLocaleDateString('en-US', { month: 'long' })
  const startYear = schoolYearStartFor(today)
  const schoolYearLabel = `${startYear}–${String(startYear + 1).slice(2)}`
  const starsForYear = starSpan === 'year'

  return [
    {
      id: 'stars',
      label: starsForYear ? 'Stars of the Day' : `Stars in ${monthName}`,
      labelKey: starsForYear ? 'managerHome.starsThisYear' : null,
      period: starsForYear ? schoolYearLabel : `${monthName} ${today.getFullYear()}`,
      records: starsForYear
        ? dailyStarsInSchoolYear(records, startYear, locationIds)
        : dailyStarsInMonth(records, monthKey, locationIds),
    },
    {
      id: 'ace-buck',
      label: 'Star Coach Bucks',
      labelKey: 'managerHome.starCoachBucks',
      period: schoolYearLabel,
      records: aceBucksInSchoolYear(records, startYear, locationIds),
    },
    {
      id: 'shooting-star',
      label: 'Shooting Stars',
      labelKey: 'managerHome.shootingStars',
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
  const { t } = useLanguage()
  const [open, setOpen] = useState(null)
  const openTile = tiles.find(tile => tile.id === open) || null

  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {tiles.map(tile => (
          <MetricTile
            key={tile.id}
            label={tile.labelKey ? t(tile.labelKey) : tile.label}
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
  const { t } = useLanguage()
  const term = useProgramTerms()
  const records = tile.records
  const label = tile.labelKey ? t(tile.labelKey) : tile.label

  return (
    <section id={id} className="mt-3 rounded-xl border border-brand-200 bg-white p-5" aria-live="polite">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-gray-800">{label} · {tile.period}</h2>
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
              : 'Former employee'
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

