// The settings Liz owns, in one place, without a deploy.
//
// Every section follows the same shape: show what is in force, let her change
// it, say plainly whether it is the shipped default or something she set, and
// offer a way back. Saving validates through programSettings, so the rules are
// the same whether a value arrives from this page or anywhere else.
//
// Liz's tier only. These change what the app says about somebody's job, and
// the server enforces the same bar.
import { useMemo, useState } from 'react'
import { useAuth } from '../components/PinGate.jsx'
import { hasLizAdminAccess } from '../data/futureTools.js'
import { getEmployeesWithEffectiveLocations } from '../data/employeeLocations.js'
import { DEFAULT_CRITERION_LABELS } from '../data/programDefaults.js'
import {
  criterionLabels,
  customisedSections,
  occurrenceThresholds,
  positionTrainingHours,
  resetProgramSetting,
  saveProgramSettings,
  settingsAudit,
  spanishApproval,
  starLevels,
} from '../data/programSettings.js'

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function ProgramSettings() {
  const access = useAuth()
  const { displayName, dataVersion } = access
  const [savedCount, setSavedCount] = useState(0)
  const [message, setMessage] = useState(null)

  const customised = useMemo(() => customisedSections(), [dataVersion, savedCount])
  const audit = useMemo(() => settingsAudit(), [dataVersion, savedCount])

  if (!hasLizAdminAccess(access)) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h1 className="text-lg font-bold text-gray-900">Program settings</h1>
        <p className="mt-2 text-sm text-gray-500">
          These settings change the program for every school, so they are kept to the district
          administrator. Ask Liz if something needs changing.
        </p>
      </div>
    )
  }

  const commit = (patch, label) => {
    try {
      saveProgramSettings(patch, { changedBy: displayName })
      setSavedCount(count => count + 1)
      setMessage({ tone: 'ok', text: `${label} saved.` })
    } catch (error) {
      setMessage({ tone: 'bad', text: error.message || 'Could not save that.' })
    }
  }

  const revert = (section, label) => {
    resetProgramSetting(section, { changedBy: displayName })
    setSavedCount(count => count + 1)
    setMessage({ tone: 'ok', text: `${label} back to the shipped default.` })
  }

  return (
    <div className="space-y-5">
      <header className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-600">District administrator</p>
        <h1 className="mt-1 text-xl font-bold text-gray-900 sm:text-2xl">Program settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Changes take effect everywhere as soon as they save. No release needed.
        </p>
        {audit && (
          <p className="mt-2 text-xs text-gray-400">
            Last changed {String(audit.changedAt).slice(0, 10)}{audit.changedBy ? ` by ${audit.changedBy}` : ''}.
          </p>
        )}
        {message && (
          <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${
            message.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
          }`}>
            {message.text}
          </p>
        )}
      </header>

      <MilestonesSection
        key={`levels-${savedCount}`}
        customised={customised.includes('starLevels')}
        onSave={levels => commit({ starLevels: levels }, 'Milestones')}
        onReset={() => revert('starLevels', 'Milestones')}
      />

      <OccurrenceSection
        key={`occurrence-${savedCount}`}
        customised={customised.includes('occurrence')}
        onSave={occurrence => commit({ occurrence }, 'Occurrence stages')}
        onReset={() => revert('occurrence', 'Occurrence stages')}
      />

      <TrainingHoursSection
        key={`hours-${savedCount}`}
        customised={customised.includes('trainingHours')}
        onSave={hours => commit({ trainingHours: hours }, 'Training hours')}
        onReset={() => revert('trainingHours', 'Training hours')}
      />

      <WordingSection
        key={`wording-${savedCount}`}
        customised={customised.includes('criterionLabels')}
        onSave={labels => commit({ criterionLabels: labels }, 'Recognition wording')}
        onReset={() => revert('criterionLabels', 'Recognition wording')}
      />

      <SpanishSection
        key={`spanish-${savedCount}`}
        customised={customised.includes('spanishApproval')}
        actor={displayName}
        onSave={approval => commit({ spanishApproval: approval }, 'Spanish sign-off')}
        onReset={() => revert('spanishApproval', 'Spanish sign-off')}
      />
    </div>
  )
}

function Section({ title, description, customised, onReset, children, warning }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-gray-900">{title}</h2>
          <p className="mt-0.5 text-xs text-gray-500">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            customised ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {customised ? 'Changed by you' : 'Shipped default'}
          </span>
          {customised && (
            <button
              type="button"
              onClick={onReset}
              className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50"
            >
              Reset
            </button>
          )}
        </div>
      </div>
      {warning && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{warning}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function SaveButton({ children = 'Save' }) {
  return (
    <button type="submit" className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700">
      {children}
    </button>
  )
}

function MilestonesSection({ customised, onSave, onReset }) {
  const [levels, setLevels] = useState(() => starLevels().map(level => ({ ...level })))

  const update = (index, field, value) => {
    setLevels(current => current.map((level, position) =>
      position === index ? { ...level, [field]: value } : level))
  }

  return (
    <Section
      title="Star milestones"
      description="What an employee's star count is called, and how many stars it takes."
      customised={customised}
      onReset={onReset}
    >
      <form
        onSubmit={event => {
          event.preventDefault()
          onSave(levels.map(level => ({ ...level, minimum: Number(level.minimum) })))
        }}
      >
        <div className="space-y-2">
          {levels.map((level, index) => (
            <div key={level.id || index} className="flex flex-wrap items-center gap-2">
              <input
                value={level.symbol}
                onChange={event => update(index, 'symbol', event.target.value)}
                aria-label={`${level.name} symbol`}
                className="w-12 rounded-lg border border-gray-200 px-2 py-1.5 text-center text-sm"
              />
              <input
                value={level.name}
                onChange={event => update(index, 'name', event.target.value)}
                aria-label={`Milestone ${index + 1} name`}
                className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
              />
              <label className="flex items-center gap-1.5 text-xs text-gray-500">
                at
                <input
                  type="number"
                  min="1"
                  value={level.minimum}
                  onChange={event => update(index, 'minimum', event.target.value)}
                  aria-label={`${level.name} star count`}
                  className="w-20 rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                />
                stars
              </label>
              {levels.length > 1 && (
                <button
                  type="button"
                  onClick={() => setLevels(current => current.filter((_, position) => position !== index))}
                  className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-50"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <SaveButton>Save milestones</SaveButton>
          <button
            type="button"
            onClick={() => setLevels(current => [...current, {
              id: `level-${Date.now()}`,
              name: '',
              minimum: (Math.max(0, ...current.map(level => Number(level.minimum) || 0)) + 10),
              symbol: '⭐',
            }])}
            className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            Add a milestone
          </button>
        </div>
      </form>
    </Section>
  )
}

function OccurrenceSection({ customised, onSave, onReset }) {
  const [stages, setStages] = useState(() => occurrenceThresholds())

  return (
    <Section
      title="Attendance occurrence stages"
      description="Which occurrence a manager starts tracking at, and which one needs formal tracking outside the app."
      customised={customised}
      onReset={onReset}
      warning={'Changing these re-reads every employee’s record against the new numbers. Somebody at the old threshold may move stage immediately, in either direction.'}
    >
      <form
        onSubmit={event => {
          event.preventDefault()
          onSave({ tracking: Number(stages.tracking), formalAction: Number(stages.formalAction) })
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <label className="text-xs font-semibold text-gray-700">
          <span className="block">Manager tracking starts at</span>
          <input
            type="number"
            min="1"
            value={stages.tracking}
            onChange={event => setStages(current => ({ ...current, tracking: event.target.value }))}
            className="mt-1 w-24 rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-gray-700">
          <span className="block">Formal tracking needed at</span>
          <input
            type="number"
            min="2"
            value={stages.formalAction}
            onChange={event => setStages(current => ({ ...current, formalAction: event.target.value }))}
            className="mt-1 w-24 rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </label>
        <SaveButton>Save stages</SaveButton>
      </form>
    </Section>
  )
}

function TrainingHoursSection({ customised, onSave, onReset }) {
  // Every position actually on the roster, plus any the table already names,
  // so a title nobody holds yet can still be given its hours in advance.
  const positions = useMemo(() => {
    const configured = positionTrainingHours()
    const onRoster = new Set(getEmployeesWithEffectiveLocations()
      .map(employee => String(employee.position || '').trim())
      .filter(Boolean))
    return [...new Set([...Object.keys(configured), ...onRoster])].sort()
  }, [])

  const [hours, setHours] = useState(() => {
    const configured = positionTrainingHours()
    return Object.fromEntries(positions.map(position => [
      position,
      Object.hasOwn(configured, position) && configured[position] !== null
        ? String(configured[position])
        : '',
    ]))
  })

  return (
    <Section
      title="Professional Standards hours"
      description="Annual hours required by position. Restarts each July."
      customised={customised}
      onReset={onReset}
    >
      <form
        onSubmit={event => {
          event.preventDefault()
          onSave(Object.fromEntries(Object.entries(hours).map(([position, value]) => [
            position,
            String(value).trim() === '' ? null : Number(value),
          ])))
        }}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {positions.map(position => (
            <label key={position} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2">
              <span className="min-w-0 truncate text-xs font-medium text-gray-700">{position}</span>
              <input
                type="number"
                min="0"
                step="0.25"
                value={hours[position] ?? ''}
                placeholder="none"
                onChange={event => setHours(current => ({ ...current, [position]: event.target.value }))}
                aria-label={`${position} required hours`}
                className="w-24 flex-none rounded-lg border border-gray-200 px-2 py-1 text-sm"
              />
            </label>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-gray-400">
          Left blank means no requirement set. Those staff are counted separately rather than as compliant.
        </p>
        <div className="mt-3"><SaveButton>Save hours</SaveButton></div>
      </form>
    </Section>
  )
}

function WordingSection({ customised, onSave, onReset }) {
  const [labels, setLabels] = useState(() => {
    const current = criterionLabels()
    return Object.fromEntries(Object.keys(DEFAULT_CRITERION_LABELS).map(value => [
      value,
      { ...(current[value] || DEFAULT_CRITERION_LABELS[value]) },
    ]))
  })

  return (
    <Section
      title="Recognition wording"
      description="What each reason is called on the printed card."
      customised={customised}
      onReset={onReset}
    >
      <form onSubmit={event => { event.preventDefault(); onSave(labels) }} className="space-y-3">
        {Object.entries(labels).map(([value, label]) => (
          <div key={value} className="rounded-lg border border-gray-100 p-3">
            <p className="text-[11px] text-gray-400">Recorded as: {value}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input
                value={label.name}
                onChange={event => setLabels(current => ({ ...current, [value]: { ...current[value], name: event.target.value } }))}
                aria-label={`${value} card name`}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold"
              />
              <input
                value={label.description}
                onChange={event => setLabels(current => ({ ...current, [value]: { ...current[value], description: event.target.value } }))}
                aria-label={`${value} card description`}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
              />
            </div>
          </div>
        ))}
        <p className="text-[11px] text-gray-400">
          Only the wording changes. Records already saved keep the reason they were recorded under.
        </p>
        <SaveButton>Save wording</SaveButton>
      </form>
    </Section>
  )
}

function SpanishSection({ customised, actor, onSave, onReset }) {
  const approved = spanishApproval()
  const [name, setName] = useState(() => approved?.approvedBy || actor || '')
  const [date, setDate] = useState(() => approved?.approvedOn || todayKey())

  return (
    <Section
      title="Spanish wording sign-off"
      description="Until this is recorded, every Spanish screen says the wording is still a draft under review."
      customised={customised}
      onReset={onReset}
    >
      {approved ? (
        <p className="text-sm text-gray-700">
          Approved by <strong>{approved.approvedBy}</strong> on {approved.approvedOn}. The review notice is hidden.
        </p>
      ) : (
        <form
          onSubmit={event => { event.preventDefault(); onSave({ approvedBy: name, approvedOn: date }) }}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="text-xs font-semibold text-gray-700">
            <span className="block">Approved by</span>
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              className="mt-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-gray-700">
            <span className="block">Date</span>
            <input
              type="date"
              value={date}
              onChange={event => setDate(event.target.value)}
              className="mt-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
          <SaveButton>Record sign-off</SaveButton>
        </form>
      )}
    </Section>
  )
}
