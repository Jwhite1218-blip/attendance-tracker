// Professional Standards training: entry, and the by-school hours report.
//
// Liz, 2026-10-10: "Need to be able to input a Training Records and pull
// reports by school for training hours." Requirements restart each July, which
// is why the year selector is here rather than being assumed.
//
// Administrator-only. The entry form she described selects across every school
// at once, which is a district act, and the server will not send training
// records to a school session at all. If building managers should log their
// own huddles, that is a deliberate follow-up, not an oversight.
import { useMemo, useState } from 'react'
import { useAuth } from '../components/PinGate.jsx'
import { LOCATIONS, LOCATION_MAP } from '../data/locations.js'
import { getEmployeesWithEffectiveLocations } from '../data/employeeLocations.js'
import {
  TRAINING_AREAS,
  TRAINING_AREA_MAP,
  TRAINING_HOUR_OPTIONS,
  TRAINING_TYPES,
  TRAINING_TYPE_MAP,
  addTrainingRecord,
  formatTrainingHours,
  getAllTrainingRecords,
  removeTrainingRecord,
  trainingSchoolYearStart,
  trainingSummaryByLocation,
} from '../data/trainingRecords.js'

const STATUS_STYLE = {
  met: 'bg-emerald-50 text-emerald-700',
  short: 'bg-amber-50 text-amber-800',
  unset: 'bg-gray-100 text-gray-500',
}

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function Training() {
  const { role, canManageRoster, displayName, dataVersion } = useAuth()
  const canRecord = role === 'admin' && canManageRoster === true

  const [schoolYear, setSchoolYear] = useState(() => trainingSchoolYearStart())
  const [showForm, setShowForm] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [openLocation, setOpenLocation] = useState(null)

  const employees = useMemo(
    () => getEmployeesWithEffectiveLocations().filter(employee => employee.active !== false),
    [dataVersion, savedCount]
  )
  const records = useMemo(() => getAllTrainingRecords(), [dataVersion, savedCount])
  const groups = useMemo(
    () => trainingSummaryByLocation(records, employees, schoolYear),
    [records, employees, schoolYear]
  )

  const districtTotals = useMemo(() => groups.reduce((totals, group) => ({
    staff: totals.staff + group.staffCount,
    hours: Math.round((totals.hours + group.totalHours) * 100) / 100,
    met: totals.met + group.metCount,
    short: totals.short + group.shortCount,
    unset: totals.unset + group.unsetCount,
  }), { staff: 0, hours: 0, met: 0, short: 0, unset: 0 }), [groups])

  const yearRecords = useMemo(
    () => records.filter(record => {
      const date = String(record.date || '')
      return date >= `${schoolYear}-07-01` && date <= `${schoolYear + 1}-06-30`
    }),
    [records, schoolYear]
  )

  if (role !== 'admin') {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h1 className="text-lg font-bold text-gray-900">Professional Standards</h1>
        <p className="mt-2 text-sm text-gray-500">
          Training records are kept at district level. Ask Liz for your building&apos;s hours report.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <header className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-600">USDA Professional Standards</p>
            <h1 className="mt-1 text-xl font-bold text-gray-900 sm:text-2xl">Training hours</h1>
            <p className="mt-1 text-xs text-gray-500">
              Required hours restart each July. Showing the {schoolYear}&ndash;{schoolYear + 1} school year.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
              <button type="button" onClick={() => setSchoolYear(year => year - 1)} className="px-2.5 py-2 text-gray-600 hover:bg-gray-50">&larr;</button>
              <span className="px-2 py-2 text-gray-900">{schoolYear}&ndash;{schoolYear + 1}</span>
              <button type="button" onClick={() => setSchoolYear(year => year + 1)} className="px-2.5 py-2 text-gray-600 hover:bg-gray-50">&rarr;</button>
            </div>
            {canRecord && (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700"
              >
                Add training
              </button>
            )}
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4 sm:grid-cols-4">
          <Stat label="Hours recorded" value={formatTrainingHours(districtTotals.hours)} />
          <Stat label="Requirement met" value={districtTotals.met} />
          <Stat label="Still short" value={districtTotals.short} />
          <Stat label="No requirement set" value={districtTotals.unset} />
        </dl>

        {districtTotals.unset > 0 && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <strong>{districtTotals.unset} staff have no required hours set.</strong> Liz&apos;s notes give 12 hours for
            Program Directors and 6 for Program Staff, which leaves Food Service Worker Leads and Food Service
            Managers unnamed. They are counted as unset rather than compliant until she confirms the figure.
          </p>
        )}
      </header>

      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 p-4 sm:p-5">
          <h2 className="text-sm font-bold text-gray-900">Hours by school</h2>
          <p className="mt-0.5 text-xs text-gray-500">Select a school to see each person&apos;s hours.</p>
        </div>
        {groups.length === 0 && (
          <p className="p-5 text-sm text-gray-500">No active staff to report on.</p>
        )}
        <ul className="divide-y divide-gray-100">
          {groups.map(group => {
            const open = openLocation === group.locationId
            return (
              <li key={group.locationId}>
                <button
                  type="button"
                  onClick={() => setOpenLocation(open ? null : group.locationId)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-gray-50 sm:p-5"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-gray-900">
                      {group.locationId === 'unassigned'
                        ? 'No school assigned'
                        : LOCATION_MAP[group.locationId]?.name || group.locationId}
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {group.staffCount} staff · {formatTrainingHours(group.totalHours)} hours ·{' '}
                      {group.metCount} met{group.shortCount ? ` · ${group.shortCount} short` : ''}
                      {group.unsetCount ? ` · ${group.unsetCount} unset` : ''}
                    </span>
                  </span>
                  <span className="text-gray-400" aria-hidden="true">{open ? '▴' : '▾'}</span>
                </button>
                {open && (
                  <div className="overflow-x-auto border-t border-gray-100 bg-gray-50/60">
                    <table className="w-full text-left text-xs">
                      <thead className="text-[10px] uppercase tracking-wide text-gray-400">
                        <tr>
                          <th scope="col" className="px-4 py-2 font-semibold">Employee</th>
                          <th scope="col" className="px-4 py-2 font-semibold">Position</th>
                          <th scope="col" className="px-4 py-2 font-semibold">Earned</th>
                          <th scope="col" className="px-4 py-2 font-semibold">Required</th>
                          <th scope="col" className="px-4 py-2 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {group.rows.map(row => (
                          <tr key={row.employeeId}>
                            <td className="px-4 py-2 font-medium text-gray-900">
                              {row.employee.first_name} {row.employee.last_name}
                            </td>
                            <td className="px-4 py-2 text-gray-500">{row.employee.position || '—'}</td>
                            <td className="px-4 py-2 text-gray-700">{formatTrainingHours(row.earned)}</td>
                            <td className="px-4 py-2 text-gray-700">
                              {row.required == null ? '—' : formatTrainingHours(row.required)}
                            </td>
                            <td className="px-4 py-2">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[row.status]}`}>
                                {row.status === 'met' ? 'Met'
                                  : row.status === 'short' ? `${formatTrainingHours(row.remaining)} to go`
                                  : 'No requirement set'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
        <h2 className="text-sm font-bold text-gray-900">Training recorded this year</h2>
        {yearRecords.length === 0 && (
          <p className="mt-2 text-sm text-gray-500">Nothing recorded for {schoolYear}&ndash;{schoolYear + 1} yet.</p>
        )}
        <ul className="mt-3 divide-y divide-gray-100">
          {yearRecords.map(record => (
            <li key={record.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{record.title}</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {record.date} · {formatTrainingHours(record.hours)} h ·{' '}
                  {TRAINING_TYPE_MAP[record.type]?.label || record.type} ·{' '}
                  {record.employeeIds.length} attended
                  {record.trainer ? ` · ${record.trainer}` : ''}
                </p>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  {record.areas.map(area => TRAINING_AREA_MAP[area]?.label || area).join(' · ')}
                </p>
              </div>
              {canRecord && (
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm(`Delete "${record.title}" and the hours it gave ${record.employeeIds.length} staff?`)) return
                    removeTrainingRecord(record.id)
                    setSavedCount(count => count + 1)
                  }}
                  className="flex-none rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-500 hover:bg-gray-50"
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {showForm && canRecord && (
        <AddTrainingModal
          employees={employees}
          actor={displayName}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); setSavedCount(count => count + 1) }}
        />
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div>
      <dd className="text-xl font-black text-gray-900">{value}</dd>
      <dt className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
    </div>
  )
}

function AddTrainingModal({ employees, actor, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: '',
    date: todayKey(),
    hours: '',
    type: '',
    areas: [],
    trainer: '',
  })
  // 'all' | 'schools' | 'people' — Liz: "Select all employees or select
  // specific schools or select employees individually".
  const [scope, setScope] = useState('all')
  const [selectedSchools, setSelectedSchools] = useState([])
  const [selectedPeople, setSelectedPeople] = useState([])
  const [error, setError] = useState('')

  const update = (field, value) => {
    setForm(current => ({ ...current, [field]: value }))
    setError('')
  }

  const toggle = (list, setList, value) => {
    setList(current => (current.includes(value)
      ? current.filter(item => item !== value)
      : [...current, value]))
    setError('')
  }

  const attendees = useMemo(() => {
    if (scope === 'all') return employees
    if (scope === 'schools') return employees.filter(employee => selectedSchools.includes(employee.location))
    return employees.filter(employee => selectedPeople.includes(String(employee.kronos_id || employee.id)))
  }, [scope, employees, selectedSchools, selectedPeople])

  const handleSubmit = event => {
    event.preventDefault()
    try {
      addTrainingRecord({
        ...form,
        hours: Number(form.hours),
        employeeIds: attendees.map(employee => String(employee.kronos_id || employee.id)),
      }, { createdBy: actor })
      onSaved()
    } catch (submitError) {
      setError(submitError.message || 'Unable to save this training.')
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
      <button type="button" className="absolute inset-0 bg-black/45" onClick={onClose} aria-label="Close add training form" />
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-training-title"
        className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-gray-100 bg-white p-5">
          <div>
            <h2 id="add-training-title" className="text-lg font-bold text-gray-900">Add training</h2>
            <p className="mt-1 text-xs text-gray-500">Counts toward Professional Standards hours for everyone selected.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Close">✕</button>
        </div>

        <div className="space-y-4 p-5">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Training title</span>
            <input
              value={form.title}
              onChange={event => update('title', event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              placeholder="Allergen awareness"
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Date</span>
              <input
                type="date"
                value={form.date}
                onChange={event => update('date', event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Hours earned</span>
              <select
                value={form.hours}
                onChange={event => update('hours', event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select…</option>
                {TRAINING_HOUR_OPTIONS.map(hours => (
                  <option key={hours} value={hours}>{formatTrainingHours(hours)}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Type</span>
              <select
                value={form.type}
                onChange={event => {
                  const type = event.target.value
                  const preset = TRAINING_TYPE_MAP[type]?.defaultHours
                  setForm(current => ({
                    ...current,
                    type,
                    hours: preset != null && !current.hours ? String(preset) : current.hours,
                  }))
                  setError('')
                }}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select…</option>
                {TRAINING_TYPES.map(type => (
                  <option key={type.id} value={type.id}>{type.label}</option>
                ))}
              </select>
            </label>
          </div>

          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">Training area</legend>
            <p className="mt-0.5 text-[11px] text-gray-400">More than one can apply.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {TRAINING_AREAS.map(area => (
                <label key={area.id} className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                  form.areas.includes(area.id)
                    ? 'border-brand-300 bg-brand-50 text-brand-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={form.areas.includes(area.id)}
                    onChange={() => update('areas', form.areas.includes(area.id)
                      ? form.areas.filter(item => item !== area.id)
                      : [...form.areas, area.id])}
                  />
                  {area.label}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Trainer</span>
            <input
              value={form.trainer}
              onChange={event => update('trainer', event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              placeholder="Who delivered it"
            />
          </label>

          <fieldset className="rounded-lg border border-gray-200 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Who attended</legend>
            <div className="flex flex-wrap gap-2">
              {[
                ['all', 'All employees'],
                ['schools', 'Specific schools'],
                ['people', 'Individually'],
              ].map(([value, label]) => (
                <label key={value} className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                  scope === value ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                  <input
                    type="radio"
                    name="training-scope"
                    className="sr-only"
                    checked={scope === value}
                    onChange={() => { setScope(value); setError('') }}
                  />
                  {label}
                </label>
              ))}
            </div>

            {scope === 'schools' && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[...LOCATIONS].sort((a, b) => a.sort - b.sort).map(location => (
                  <label key={location.id} className={`cursor-pointer rounded border px-2 py-1 text-[11px] font-medium ${
                    selectedSchools.includes(location.id)
                      ? 'border-brand-300 bg-brand-50 text-brand-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={selectedSchools.includes(location.id)}
                      onChange={() => toggle(selectedSchools, setSelectedSchools, location.id)}
                    />
                    {location.name}
                  </label>
                ))}
              </div>
            )}

            {scope === 'people' && (
              <div className="mt-3 max-h-48 overflow-y-auto rounded border border-gray-100">
                {[...employees]
                  .sort((a, b) => String(a.last_name || '').localeCompare(String(b.last_name || '')))
                  .map(employee => {
                    const key = String(employee.kronos_id || employee.id)
                    return (
                      <label key={key} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={selectedPeople.includes(key)}
                          onChange={() => toggle(selectedPeople, setSelectedPeople, key)}
                        />
                        <span className="text-gray-900">{employee.last_name}, {employee.first_name}</span>
                        <span className="ml-auto text-gray-400">{LOCATION_MAP[employee.location]?.name || employee.location}</span>
                      </label>
                    )
                  })}
              </div>
            )}

            <p className="mt-2 text-xs font-semibold text-gray-600">
              {attendees.length} {attendees.length === 1 ? 'person' : 'people'} selected
            </p>
          </fieldset>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}
        </div>

        <div className="sticky bottom-0 flex gap-2 border-t border-gray-100 bg-white p-5">
          <button type="submit" className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Save training
          </button>
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
