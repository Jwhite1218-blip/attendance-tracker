import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../components/PinGate.jsx'
import warrenLogo from '../assets/warren-logo.png'
import { getEmployeesWithEffectiveLocations } from '../data/employeeLocations.js'
import { buildStarCardHtml } from '../data/starCard.js'
import { LOCATIONS, LOCATION_MAP } from '../data/locations.js'
import {
  ANNUAL_AWARD_CATEGORIES,
  RECOGNITION_CRITERIA,
  RECOGNITION_CRITERIA_DESCRIPTIONS,
  RECOGNITION_TYPE_MAP,
  STAR_LEVELS,
  addRecognition,
  drawMonthlyAllStar,
  existingMonthlyWinner,
  getAllRecognitions,
  getEmployeeStarCount,
  getMonthlyDrawingEntries,
  getNextStarLevel,
  getStarLevel,
  recognitionEarnsStar,
  requiresStarMessage,
  schoolYearStartFor,
  submitterLocationLabel,
  getSubmissionCountsByLocation,
  DISTRICT_SUBMITTER_ID,
} from '../data/recognitionStore.js'
import {
  monthlyDrawingStatus,
  quarterWindowFor,
  recognitionTypeAllowedForRole,
} from '../data/recognitionRules.js'
import { flushPendingWrites } from '../data/sharedStore.js'

function localDateKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function monthAwardDate(monthKey) {
  const [year, month] = monthKey.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  return `${monthKey}-${String(lastDay).padStart(2, '0')}`
}

function employeeKey(employee) {
  return String(employee?.kronos_id || employee?.id || '')
}

function employeeName(employee) {
  return `${employee?.first_name || ''} ${employee?.last_name || ''}`.trim()
}

// The picker is a lookup list, so it reads "Last, First" like the Employee
// Records ledger — that is what makes its alphabetical order visible on screen.
// Star cards, the leaderboard and confirmations stay on employeeName's
// "First Last" so the recognition copy still reads like a person's name.
function employeeListName(employee) {
  const lastName = String(employee?.last_name || '').trim()
  const firstName = String(employee?.first_name || '').trim()
  if (!lastName) return firstName
  return firstName ? `${lastName}, ${firstName}` : lastName
}

function formatMonth(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(String(monthKey || ''))) return monthKey
  return new Date(`${monthKey}-01T12:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

function formatDate(dateKey) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// Opens the card in its own window and sends it straight to the print dialog.
// The card is written into a fresh document rather than printed from this page
// so the app's own layout can never bleed into the printed sheet.
function openStarCardPrintWindow(card) {
  const printWindow = window.open('', '_blank', 'width=880,height=780')
  if (!printWindow) return false
  printWindow.document.open()
  printWindow.document.write(buildStarCardHtml([card], { pad: false }))
  printWindow.document.close()
  printWindow.focus()
  // A document.write'd page has no load event to wait on, so give the layout a
  // tick to settle before the dialog opens over it.
  setTimeout(() => {
    try {
      printWindow.print()
    } catch {
      // The window is still open and printable by hand if the dialog is refused.
    }
  }, 300)
  return true
}

function emptyRecognitionForm(type) {
  return { employeeId: '', type, date: localDateKey(), criteria: [], note: '', sourceName: '' }
}

// The extras a manager may record beyond the daily star. Employee of the Month
// stays district-only, so it is filtered by role at render time.
const BONUS_RECOGNITION_TYPES = ['shooting-star', 'star-shout-out', 'warren-employee-month']

export default function RecognitionProgram() {
  const access = useAuth()
  const {
    role,
    locationId,
    displayName,
    canEditRecognition,
    canManageRecognitionAwards,
    dataVersion,
  } = access
  const [localVersion, setLocalVersion] = useState(0)
  const [scopeLocation, setScopeLocation] = useState(role === 'school' ? locationId : 'all')
  const [drawingLocation, setDrawingLocation] = useState(role === 'school' ? locationId : '')
  const [drawingMonth, setDrawingMonth] = useState(localDateKey().slice(0, 7))
  // Two separate entry surfaces. Star of the Day is the daily job and owns the
  // main column; nominations and shout-outs are occasional extras and live in
  // the side panel, so the two never compete for a manager's attention.
  const [starForm, setStarForm] = useState(() => emptyRecognitionForm('star-of-day'))
  const [bonusForm, setBonusForm] = useState(() => emptyRecognitionForm('shooting-star'))
  const [feedback, setFeedback] = useState(null)
  const [submittingSurface, setSubmittingSurface] = useState(null)
  const [confirmations, setConfirmations] = useState({ star: null, bonus: null })

  const employees = useMemo(
    () => getEmployeesWithEffectiveLocations(),
    [dataVersion, localVersion]
  )
  const records = useMemo(
    () => getAllRecognitions(),
    [dataVersion, localVersion]
  )
  const employeeMap = useMemo(
    () => new Map(employees.map(employee => [employeeKey(employee), employee])),
    [employees]
  )
  const availableLocations = useMemo(() => {
    const ids = new Set(employees.map(employee => employee.location).filter(Boolean))
    return LOCATIONS.filter(location => ids.has(location.id))
  }, [employees])
  const scopedEmployees = scopeLocation === 'all'
    ? employees
    : employees.filter(employee => employee.location === scopeLocation)
  const scopedRecords = scopeLocation === 'all'
    ? records
    : records.filter(record => record.locationId === scopeLocation)

  const schoolYearStart = schoolYearStartFor(new Date())
  const schoolYearRecords = scopedRecords.filter(record => (
    record.date >= `${schoolYearStart}-07-01` && record.date <= `${schoolYearStart + 1}-06-30`
  ))
  const earnedStars = schoolYearRecords.filter(recognitionEarnsStar)
  const thisMonth = localDateKey().slice(0, 7)
  const thisMonthStars = earnedStars.filter(record => record.date.startsWith(`${thisMonth}-`))
  const recognizedPeople = new Set(earnedStars.map(record => record.employeeId)).size
  const compilation = {
    dailyStars: schoolYearRecords.filter(record => record.type === 'star-of-day').length,
    shoutOuts: schoolYearRecords.filter(record => record.type === 'star-shout-out').length,
    shootingNominations: schoolYearRecords.filter(record => record.type === 'shooting-star').length,
    employeeOfMonth: schoolYearRecords.filter(record => record.type === 'warren-employee-month').length,
    buildingAllStars: schoolYearRecords.filter(record => record.type === 'all-star-of-month').length,
  }

  const leaderboard = scopedEmployees
    .map(employee => {
      const count = getEmployeeStarCount(records, employeeKey(employee), schoolYearStart)
      return { employee, count, level: getStarLevel(count), nextLevel: getNextStarLevel(count) }
    })
    .filter(entry => entry.count > 0)
    .sort((left, right) => right.count - left.count || employeeName(left.employee).localeCompare(employeeName(right.employee)))

  const bonusTypes = BONUS_RECOGNITION_TYPES.filter(type =>
    recognitionTypeAllowedForRole(role, type, canManageRecognitionAwards))
  const starSubmissionsByLocation = getSubmissionCountsByLocation(schoolYearRecords)
  const drawingScope = role === 'school' ? locationId : (scopeLocation !== 'all' ? scopeLocation : drawingLocation)
  const drawingEntries = drawingScope ? getMonthlyDrawingEntries(records, drawingScope, drawingMonth) : []
  const monthlyWinner = drawingScope ? existingMonthlyWinner(records, drawingScope, drawingMonth) : null
  const monthlyWinnerEmployee = monthlyWinner ? employeeMap.get(String(monthlyWinner.employeeId)) : null
  const drawingAvailability = monthlyDrawingStatus(drawingMonth)
  const nominationQuarter = quarterWindowFor(new Date())
  const shootingStarNominations = scopedRecords.filter(record => (
    record.type === 'shooting-star'
    && record.date >= nominationQuarter.start
    && record.date <= nominationQuarter.end
  ))

  const surfaceSetters = { star: setStarForm, bonus: setBonusForm }
  const clearConfirmation = surface => setConfirmations(current => ({ ...current, [surface]: null }))
  const setFormValue = (surface, name, value) => {
    clearConfirmation(surface)
    surfaceSetters[surface](current => (
      // Reasons are per-type, so switching type must drop the previous
      // selections rather than silently carrying invalid ones forward.
      name === 'type'
        ? { ...current, type: value, criteria: [], sourceName: '' }
        : { ...current, [name]: value }
    ))
  }
  const toggleCriterion = (surface, criterion) => {
    clearConfirmation(surface)
    surfaceSetters[surface](current => ({
      ...current,
      criteria: current.criteria.includes(criterion)
        ? current.criteria.filter(value => value !== criterion)
        : [...current.criteria, criterion],
    }))
  }

  // card is the printable Star of the Day payload, or null for the surfaces that
  // do not produce one. It rides on the confirmation so the Print button stays
  // available after the form has been cleared for the next entry.
  const finishConfirmedSubmission = (surface, message, card = null) => {
    surfaceSetters[surface](current => ({
      ...current,
      employeeId: '',
      criteria: [],
      note: '',
      sourceName: '',
    }))
    setLocalVersion(version => version + 1)
    setFeedback({ type: 'success', message })
    setConfirmations(current => ({
      ...current,
      [surface]: { type: 'saved', message: `${message} The shared record is confirmed.`, card },
    }))
  }

  const handlePrintCard = surface => {
    const card = confirmations[surface]?.card
    if (!card) return
    if (!openStarCardPrintWindow(card)) {
      setFeedback({
        type: 'error',
        message: 'Your browser blocked the print window. Allow pop-ups for this site, then use Print star card again.',
      })
    }
  }

  const submitRecognition = async (surface, form, event) => {
    event.preventDefault()
    setFeedback(null)
    clearConfirmation(surface)
    setSubmittingSurface(surface)
    let confirmationMessage = ''
    let card = null
    try {
      if (!recognitionTypeAllowedForRole(role, form.type, canManageRecognitionAwards)) {
        throw new Error('Only a district administrator can record Warren Food Services Employee of the Month.')
      }
      const employee = employeeMap.get(String(form.employeeId))
      if (!employee) throw new Error('Choose an employee from your available roster.')
      const record = addRecognition({
        ...form,
        locationId: employee.location,
        recognizedBy: displayName || 'Authenticated manager',
        recognizedByLocationId: role === 'school' ? locationId : DISTRICT_SUBMITTER_ID,
      })
      confirmationMessage = record.type === 'shooting-star'
        ? `${employeeName(employee)} was added to the quarterly Shooting Star nominations.`
        : `${employeeName(employee)} received ${RECOGNITION_TYPE_MAP[record.type].label}.`
      // Only the daily star has a printable card: the physical board is a Star
      // of the Day board, and a nomination is not an award yet.
      card = record.type === 'star-of-day'
        ? {
          name: employeeName(employee),
          date: record.date,
          criteria: record.criteria,
          message: record.note,
          recognizedBy: record.recognizedBy,
        }
        : null
      await flushPendingWrites()
      finishConfirmedSubmission(surface, confirmationMessage, card)
    } catch (error) {
      if (confirmationMessage) {
        const pendingMessage = 'The entry is saved on this device, but the shared record is not confirmed yet. Do not submit it again—use Retry confirmation below.'
        setFeedback({ type: 'error', message: pendingMessage })
        setConfirmations(current => ({
          ...current,
          [surface]: { type: 'pending', message: pendingMessage, confirmationMessage, card },
        }))
      } else {
        setFeedback({ type: 'error', message: error.message })
      }
    } finally {
      setSubmittingSurface(null)
    }
  }

  const handleRetryConfirmation = async surface => {
    const confirmation = confirmations[surface]
    if (confirmation?.type !== 'pending') return
    setSubmittingSurface(surface)
    setFeedback(null)
    try {
      await flushPendingWrites()
      finishConfirmedSubmission(surface, confirmation.confirmationMessage, confirmation.card)
    } catch {
      const pendingMessage = 'The shared record is still not confirmed. Keep this page open and try again when the connection is restored.'
      setFeedback({ type: 'error', message: pendingMessage })
      setConfirmations(current => ({
        ...current,
        [surface]: { ...current[surface], message: pendingMessage },
      }))
    } finally {
      setSubmittingSurface(null)
    }
  }

  const handleMonthlyDrawing = () => {
    setFeedback(null)
    try {
      if (!drawingScope) throw new Error('Choose a building for the monthly drawing.')
      if (!drawingAvailability.isOpen) throw new Error(`The drawing opens during the final week of ${formatMonth(drawingMonth)}.`)
      if (monthlyWinner) throw new Error(`${formatMonth(drawingMonth)} already has a recorded winner for this building.`)
      const result = drawMonthlyAllStar(records, drawingScope, drawingMonth)
      if (!result) throw new Error('This building has no Star of the Day entries for that month.')
      const winner = employeeMap.get(String(result.employeeId))
      if (!winner) throw new Error('The selected employee is not available in this roster.')
      addRecognition({
        employeeId: result.employeeId,
        locationId: drawingScope,
        type: 'all-star-of-month',
        date: monthAwardDate(drawingMonth),
        monthKey: drawingMonth,
        criteria: [],
        note: `Selected from ${result.totalEntries} building entr${result.totalEntries === 1 ? 'y' : 'ies'}; ${result.entryCount} belonged to this employee.`,
        recognizedBy: displayName || 'Authenticated manager',
      })
      setLocalVersion(version => version + 1)
      setFeedback({ type: 'success', message: `${employeeName(winner)} is ${formatMonth(drawingMonth)} All-Star of the Month.` })
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#f7f3e9] pb-12">
      <AllStarHero schoolYearStart={schoolYearStart} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6 relative z-10">
        <div className="rounded-2xl border border-[#d7b44b]/50 bg-white shadow-xl overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-amber-100 bg-white px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#9a651b]">Recognition command center</p>
              <p className="mt-1 text-sm text-gray-500">Catch someone shining, track every earned star, and celebrate building All-Stars.</p>
            </div>
            {role === 'admin' ? (
              <label className="flex items-center gap-3 text-sm font-semibold text-gray-700">
                <span>Building view</span>
                <select
                  value={scopeLocation}
                  onChange={event => setScopeLocation(event.target.value)}
                  className="min-w-52 rounded-lg border border-amber-200 bg-[#fffaf0] px-3 py-2 text-sm focus:border-[#c28b24] focus:outline-none focus:ring-2 focus:ring-amber-100"
                >
                  <option value="all">All Warren buildings</option>
                  {availableLocations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
              </label>
            ) : (
              <span className="self-start rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">
                {LOCATION_MAP[locationId]?.name || locationId}
              </span>
            )}
          </div>

          {/* Earned stars only. Every number here comes from Star of the Day so
              two tiles can never disagree about how many stars exist. */}
          <div className="grid grid-cols-3 divide-x divide-amber-100">
            <Metric label="Earned stars" value={earnedStars.length} detail={`${schoolYearStart}-${schoolYearStart + 1}`} />
            <Metric label="Stars this month" value={thisMonthStars.length} detail={`${formatMonth(thisMonth)} · also this month's drawing entries`} />
            <Metric label="Team members shining" value={recognizedPeople} detail="Unique employees with a star" />
          </div>

          {/* Everything that is deliberately NOT an earned star, kept in the same
              card so this stays one command center rather than two boards. */}
          <div className="border-t border-amber-100 bg-[#fffdf7] px-5 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-gray-400">
              Tracked separately · not earned stars
            </p>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
              <SecondaryCount label="Shout-outs" value={compilation.shoutOuts} />
              <SecondaryCount label="Shooting Star nominations" value={compilation.shootingNominations} />
              <SecondaryCount label="Building All-Stars" value={compilation.buildingAllStars} />
              {canManageRecognitionAwards && (
                <SecondaryCount label="Employee of the Month" value={compilation.employeeOfMonth} />
              )}
            </div>
          </div>
        </div>

        {feedback && (
          <div
            role="status"
            className={`mt-5 rounded-xl border px-4 py-3 text-sm font-semibold ${feedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}
          >
            {feedback.message}
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <div className="space-y-6">
            <RecognitionEntryForm
              surface="star"
              form={starForm}
              lockedType="star-of-day"
              title="Star of the Day"
              subtitle="Catch someone shining. This is the daily award that earns stars."
              employees={scopedEmployees}
              canEdit={canEditRecognition}
              isSubmitting={submittingSurface === 'star'}
              confirmation={confirmations.star}
              onFieldChange={setFormValue}
              onToggleCriterion={toggleCriterion}
              onSubmit={event => submitRecognition('star', starForm, event)}
              onRetry={() => handleRetryConfirmation('star')}
              onPrintCard={() => handlePrintCard('star')}
            />

            <StarLeaderboard leaderboard={leaderboard} schoolYearStart={schoolYearStart} />
            {/* Liz, 2026-09-01: pulled up out of the footer to close the gap the
                shorter main column left beside the taller side column. */}
            <RecentRecognition records={scopedRecords} employeeMap={employeeMap} />
          </div>

          <div className="space-y-6">
            {/* Liz, 2026-09-01: Recognition Levels leads the side column. A school
                login has no bonus surface, so the levels card already sat at the
                top there; an admin saw the bonus form pushed above it and the two
                views disagreed. */}
            <StarLevels />
            {bonusTypes.length > 0 && (
              <RecognitionEntryForm
                surface="bonus"
                form={bonusForm}
                selectableTypes={bonusTypes}
                compact
                title="Bonus recognition"
                subtitle="Nominations and shout-outs. These are tracked separately and do not earn stars."
                employees={scopedEmployees}
                canEdit={canEditRecognition}
                isSubmitting={submittingSurface === 'bonus'}
                confirmation={confirmations.bonus}
                onFieldChange={setFormValue}
                onToggleCriterion={toggleCriterion}
                onSubmit={event => submitRecognition('bonus', bonusForm, event)}
                onRetry={() => handleRetryConfirmation('bonus')}
                onPrintCard={() => handlePrintCard('bonus')}
              />
            )}
            <MonthlyDrawing
              role={role}
              canEdit={canEditRecognition}
              availableLocations={availableLocations}
              drawingLocation={drawingLocation}
              setDrawingLocation={setDrawingLocation}
              drawingMonth={drawingMonth}
              setDrawingMonth={setDrawingMonth}
              drawingScope={drawingScope}
              entries={drawingEntries}
              monthlyWinner={monthlyWinner}
              monthlyWinnerEmployee={monthlyWinnerEmployee}
              drawingAvailability={drawingAvailability}
              onDraw={handleMonthlyDrawing}
            />
            <ShootingStarNominations
              records={shootingStarNominations}
              employeeMap={employeeMap}
              quarterLabel={nominationQuarter.label}
            />
            <AceBucksCard />
          </div>
        </div>


        <SubmissionsByBuilding counts={starSubmissionsByLocation} schoolYearStart={schoolYearStart} />
        <div className="mt-6">
          <AnnualCelebration />
        </div>
      </div>
    </div>
  )
}

// One entry form, used twice: the Star of the Day surface (type locked) and the
// side-panel bonus surface (a small type picker). Keeping them separate is the
// point — managers open this page to give a daily star, and nominations should
// never sit in the way of that.
function RecognitionEntryForm({
  surface,
  form,
  selectableTypes,
  compact = false,
  title,
  subtitle,
  employees,
  canEdit,
  isSubmitting,
  confirmation,
  onFieldChange,
  onToggleCriterion,
  onSubmit,
  onRetry,
  onPrintCard,
}) {
  const currentType = RECOGNITION_TYPE_MAP[form.type]
  const criteriaOptions = RECOGNITION_CRITERIA[form.type] || []
  const messageRequired = requiresStarMessage(form.type)

  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className={`border-b border-gray-100 text-white ${compact ? 'bg-[#211b12] px-4 py-3.5' : 'bg-gradient-to-r from-[#211b12] to-black px-5 py-5 sm:px-6'}`}>
        <div className="flex items-center gap-3">
          <span
            className={`flex flex-none items-center justify-center rounded-xl border border-[#e8c65c]/60 bg-[#e8c65c]/15 text-[#ffd75c] ${compact ? 'h-9 w-9 text-lg' : 'h-12 w-12 text-2xl'}`}
            aria-hidden="true"
          >★</span>
          <div>
            <h2 className={`all-star-display uppercase tracking-wide ${compact ? 'text-lg' : 'text-2xl'}`}>{title}</h2>
            <p className={`mt-1 text-amber-100/80 ${compact ? 'text-[11px]' : 'text-xs'}`}>{subtitle}</p>
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit} className={compact ? 'space-y-4 p-4' : 'space-y-5 p-5 sm:p-6'}>
        <fieldset disabled={!canEdit} className={compact ? 'space-y-4 disabled:opacity-65' : 'space-y-5 disabled:opacity-65'}>
          {selectableTypes?.length > 0 && (
            <div>
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Recognition type</span>
              <div className="mt-2 space-y-2">
                {selectableTypes.map(typeId => {
                  const type = RECOGNITION_TYPE_MAP[typeId]
                  if (!type) return null
                  return (
                    <label
                      key={typeId}
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm transition-colors ${form.type === typeId ? 'border-[#c28b24] bg-amber-50 ring-1 ring-amber-100' : 'border-gray-200 hover:border-amber-200'}`}
                    >
                      <input
                        type="radio"
                        name={`${surface}-recognition-type`}
                        value={typeId}
                        checked={form.type === typeId}
                        onChange={() => onFieldChange(surface, 'type', typeId)}
                        className="mt-0.5 h-4 w-4 border-gray-300 text-amber-600 focus:ring-amber-400"
                      />
                      <span className="min-w-0">
                        <span className="block font-semibold text-gray-900">{type.label}</span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-gray-500">{type.description}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          <div className={compact ? 'space-y-4' : 'grid gap-4 md:grid-cols-2'}>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Team member</span>
              <select
                required
                value={form.employeeId}
                onChange={event => onFieldChange(surface, 'employeeId', event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:border-[#c28b24] focus:outline-none focus:ring-2 focus:ring-amber-100"
              >
                <option value="">Choose an employee</option>
                {employees.map(employee => (
                  <option key={employeeKey(employee)} value={employeeKey(employee)}>
                    {employeeListName(employee)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Date</span>
              <input
                type="date"
                required
                value={form.date}
                max={localDateKey()}
                onChange={event => onFieldChange(surface, 'date', event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:border-[#c28b24] focus:outline-none focus:ring-2 focus:ring-amber-100"
              />
            </label>
          </div>

          <div>
            <div className="flex items-end justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                {form.type === 'shooting-star'
                  ? 'Why they are being nominated'
                  : form.type === 'warren-employee-month' ? 'Why they were selected' : 'Why they shine'}
              </span>
              <span className="text-[11px] font-semibold text-[#9a651b]">Pick at least one</span>
            </div>
            <div className={`mt-2 grid gap-2 ${compact ? '' : 'sm:grid-cols-2'}`}>
              {criteriaOptions.map(criterion => {
                const selected = form.criteria.includes(criterion)
                return (
                  <label
                    key={criterion}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm ${selected ? 'border-[#d2a63f] bg-[#fff8df] text-gray-900' : 'border-gray-200 text-gray-600 hover:border-amber-200'}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggleCriterion(surface, criterion)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-400"
                    />
                    <span>
                      <span className="block font-semibold text-gray-800">{criterion}</span>
                      {!compact && RECOGNITION_CRITERIA_DESCRIPTIONS[criterion] && (
                        <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">{RECOGNITION_CRITERIA_DESCRIPTIONS[criterion]}</span>
                      )}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>

          {form.type === 'star-shout-out' && (
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Submitted by</span>
              <input
                type="text"
                maxLength={200}
                value={form.sourceName}
                onChange={event => onFieldChange(surface, 'sourceName', event.target.value)}
                placeholder="Student, teacher, staff member, or group"
                className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-300 focus:border-[#c28b24] focus:outline-none focus:ring-2 focus:ring-amber-100"
              />
            </label>
          )}

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
              Star card message
              {messageRequired && <span className="ml-1.5 text-[#b3261e]" aria-hidden="true">*</span>}
            </span>
            <textarea
              required={messageRequired}
              value={form.note}
              onChange={event => onFieldChange(surface, 'note', event.target.value)}
              maxLength={1000}
              rows={compact ? 2 : 3}
              placeholder={`Describe what made this ${currentType?.shortLabel || 'recognition'} special...`}
              className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-300 focus:border-[#c28b24] focus:outline-none focus:ring-2 focus:ring-amber-100"
            />
            {messageRequired && (
              <span className="mt-1 block text-[11px] font-semibold text-[#9a651b]">
                Required — say why they shine so the star means something.
              </span>
            )}
          </label>

          {canEdit ? (
            <div>
              <button
                type="submit"
                disabled={isSubmitting || confirmation?.type === 'pending'}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black uppercase tracking-wide text-white shadow-sm transition-colors disabled:cursor-wait ${confirmation?.type === 'saved' ? 'bg-emerald-600 hover:bg-emerald-600' : confirmation?.type === 'pending' ? 'bg-amber-600' : 'bg-[#ad741e] hover:bg-[#8f5d16]'}`}
              >
                <span aria-hidden="true">{isSubmitting ? '…' : confirmation?.type === 'saved' ? '✓' : confirmation?.type === 'pending' ? '!' : '★'}</span>
                {isSubmitting
                  ? 'Saving…'
                  : confirmation?.type === 'saved'
                    ? 'Recorded'
                    : confirmation?.type === 'pending'
                      ? 'Awaiting confirmation'
                      : (currentType?.actionLabel || 'Add to the All-Star board')}
              </button>
              {confirmation && (
                <div
                  role="status"
                  className={`mt-3 flex flex-col gap-2 rounded-xl border px-4 py-3 text-sm font-semibold sm:flex-row sm:items-center sm:justify-between ${confirmation.type === 'saved' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`}
                >
                  <span><span className="mr-2" aria-hidden="true">{confirmation.type === 'saved' ? '✓' : '⚠'}</span>{confirmation.message}</span>
                  {confirmation.type === 'pending' && (
                    <button
                      type="button"
                      onClick={onRetry}
                      disabled={isSubmitting}
                      className="flex-none rounded-lg border border-amber-400 bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                    >
                      Retry confirmation
                    </button>
                  )}
                  {/* Offered only once the shared record is confirmed: a printed
                      card handed to someone should mean the star is recorded. */}
                  {confirmation.type === 'saved' && confirmation.card && (
                    <button
                      type="button"
                      onClick={onPrintCard}
                      className="flex-none rounded-lg border border-emerald-400 bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-emerald-900 hover:bg-emerald-100"
                    >
                      <span className="mr-1.5" aria-hidden="true">★</span>Print star card
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800">Recognition entry is read-only for this login.</p>
          )}
        </fieldset>
      </form>
    </section>
  )
}

// Sits directly under Star of the Day: the board only ever counts earned stars,
// so the number a manager sees here always matches the award they just gave.
function StarLeaderboard({ leaderboard, schoolYearStart }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#9a651b]">Earn your stars</p>
          <h2 className="all-star-display mt-1 text-2xl uppercase text-gray-950">School-Year Leaderboard</h2>
          <p className="mt-1 text-sm text-gray-500">Counts Star of the Day only. Nominations and shout-outs are tracked separately.</p>
        </div>
        <span className="text-xs font-semibold text-gray-400">July {schoolYearStart} - June {schoolYearStart + 1}</span>
      </div>

      {leaderboard.length ? (
        <div className="mt-5 grid gap-3">
          {leaderboard.map((entry, index) => {
            const progressTarget = entry.nextLevel?.minimum || entry.count
            const progress = progressTarget ? Math.min(100, (entry.count / progressTarget) * 100) : 100
            return (
              <Link
                key={employeeKey(entry.employee)}
                to={`/employee/${employeeKey(entry.employee)}`}
                className="group rounded-xl border border-gray-200 p-4 transition-all hover:border-amber-300 hover:shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#211b12] text-sm font-black text-[#ffd75c]">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-gray-900 group-hover:text-[#9a651b]">{employeeName(entry.employee)}</p>
                        <p className="truncate text-xs text-gray-400">{LOCATION_MAP[entry.employee.location]?.name || entry.employee.location}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-black text-[#ad741e]">{entry.count}</p>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">stars</p>
                      </div>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#ad741e] to-[#f1cd57]" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="mt-1.5 text-[11px] font-semibold text-gray-500">
                      {entry.level ? `${entry.level.symbol} ${entry.level.name}` : 'Building toward Bronze Star'}
                      {entry.nextLevel ? ` - ${entry.nextLevel.minimum - entry.count} to ${entry.nextLevel.name}` : ' - Highest published level'}
                    </p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-amber-200 bg-amber-50/60 px-5 py-8 text-center">
          <p className="text-2xl" aria-hidden="true">☆</p>
          <p className="mt-2 text-sm font-bold text-gray-800">The All-Star board is ready.</p>
          <p className="mt-1 text-xs text-gray-500">Record the first Star of the Day to begin this school year.</p>
        </div>
      )}
    </section>
  )
}

// Answers "which building is actually handing out stars" — Liz's ask to break
// recognition down by the PIN that submitted it. The signed-in building stands
// in for the PIN so no credential is ever stored on a record.
function SubmissionsByBuilding({ counts, schoolYearStart }) {
  if (!counts.length) return null
  const total = counts.reduce((sum, entry) => sum + entry.count, 0)
  return (
    <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-[#9a651b]">Who is giving stars</p>
      <h2 className="all-star-display mt-1 text-xl uppercase text-gray-950">Stars submitted by building</h2>
      <p className="mt-1 text-sm text-gray-500">
        {total} Star{total === 1 ? '' : 's'} of the Day recorded in {schoolYearStart}-{schoolYearStart + 1}, grouped by the building signed in when it was given.
      </p>
      <div className="mt-4 space-y-2">
        {counts.map(entry => {
          const share = total ? Math.round((entry.count / total) * 100) : 0
          return (
            <div key={entry.locationId} className="flex items-center gap-3">
              <span className="w-44 flex-none truncate text-sm font-semibold text-gray-700">
                {submitterLocationLabel({ recognizedByLocationId: entry.locationId }, LOCATION_MAP)}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-gradient-to-r from-[#ad741e] to-[#f1cd57]" style={{ width: `${share}%` }} />
              </div>
              <span className="w-10 flex-none text-right text-sm font-black text-[#ad741e]">{entry.count}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function AllStarHero({ schoolYearStart }) {
  const stars = [
    ['8%', '18%', 'text-xl'], ['17%', '60%', 'text-xs'], ['30%', '24%', 'text-3xl'],
    ['52%', '12%', 'text-sm'], ['64%', '68%', 'text-2xl'], ['82%', '20%', 'text-xl'],
    ['92%', '55%', 'text-xs'], ['73%', '34%', 'text-xs'], ['40%', '76%', 'text-sm'],
  ]
  return (
    <header className="relative overflow-hidden border-b-4 border-[#d5aa3d] bg-black text-white">
      {stars.map(([left, top, size], index) => (
        <span key={index} className={`pointer-events-none absolute ${size} text-[#e3b93f]/60`} style={{ left, top }} aria-hidden="true">★</span>
      ))}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_15%,rgba(228,188,70,0.2),transparent_34%),linear-gradient(110deg,rgba(183,119,22,0.12),transparent_50%)]" />
      <div className="relative max-w-7xl mx-auto px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="grid items-center gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="flex items-center gap-3">
              <img src={warrenLogo} alt="Warren Township" className="h-12 w-12 rounded-lg border border-amber-300/30 bg-white object-contain p-1" />
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-[#e9c866]">Warren Student Nutrition Team</p>
                <p className="mt-1 text-xs text-white/50">{schoolYearStart}-{schoolYearStart + 1} recognition program</p>
              </div>
            </div>
            <h1 className="all-star-display mt-7 text-5xl uppercase leading-[0.88] tracking-tight sm:text-6xl lg:text-7xl">
              All-Star <span className="text-[#e7bd4d]">Recognition</span>
            </h1>
            <p className="all-star-script mt-4 text-2xl text-[#f1d98c] sm:text-3xl">Catch someone shining every day.</p>
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-white/70 sm:text-base">
              Recognizing daily excellence in service, teamwork, food quality, safety, and positivity - because every day, every meal, every star makes a difference.
            </p>
          </div>
          <div className="relative mx-auto w-full max-w-md rounded-2xl border-2 border-[#d8b34a] bg-gradient-to-br from-[#fff9dc] via-[#ddc982] to-[#a77925] p-[2px] shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
            <div className="rounded-[14px] bg-[#17130d]/95 px-6 py-7 text-center">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#eacb6e]">Every day. Every meal.</p>
              <p className="all-star-display mt-3 text-3xl uppercase leading-none text-white">Every Star Makes a Difference.</p>
              <div className="mx-auto my-5 h-px w-24 bg-[#d8b34a]" />
              <div className="flex items-center justify-center gap-4">
                <span className="text-5xl text-[#ffd75c]" aria-hidden="true">★</span>
                <span className="text-left text-xs font-black uppercase tracking-[0.18em] text-white/75">Warren Student<br />Nutrition Team</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

// A quiet counter for the categories that are tracked but do not earn stars.
function SecondaryCount({ label, value }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-sm font-black text-gray-700">{value}</span>
      <span className="text-xs text-gray-500">{label}</span>
    </span>
  )
}

function Metric({ label, value, detail }) {
  return (
    <div className="px-4 py-5 sm:px-5">
      <p className="text-2xl font-black text-gray-950">{value}</p>
      <p className="mt-0.5 text-xs font-bold uppercase tracking-wide text-[#9a651b]">{label}</p>
      <p className="mt-1 text-[11px] text-gray-400">{detail}</p>
    </div>
  )
}

function StarLevels() {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#3d3322] bg-[#15120e] text-white shadow-sm">
      <div className="border-b border-amber-200/15 px-5 py-4">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#e3b93f]">Earn your stars</p>
        <h2 className="all-star-display mt-1 text-2xl uppercase">Recognition Levels</h2>
      </div>
      <div className="divide-y divide-white/10">
        {STAR_LEVELS.map(level => (
          <div key={level.id} className="flex items-center gap-3 px-5 py-3">
            <span className="text-xl" aria-hidden="true">{level.symbol}</span>
            <span className="flex-1 text-sm font-bold">{level.name}</span>
            <span className="text-xs font-semibold text-amber-100/70">{level.minimum} recognitions</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function MonthlyDrawing({
  role,
  canEdit,
  availableLocations,
  drawingLocation,
  setDrawingLocation,
  drawingMonth,
  setDrawingMonth,
  drawingScope,
  entries,
  monthlyWinner,
  monthlyWinnerEmployee,
  drawingAvailability,
  onDraw,
}) {
  const uniqueCandidates = new Set(entries.map(entry => entry.employeeId)).size
  return (
    <section className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-amber-100 text-xl" aria-hidden="true">🏅</span>
        <div>
          <h2 className="all-star-display text-xl uppercase text-gray-950">All-Star of the Month</h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">Each Star of the Day equals one entry. More daily stars mean a greater chance of selection.</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {role === 'admin' && (
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Building</span>
            <select
              value={drawingScope || drawingLocation}
              onChange={event => setDrawingLocation(event.target.value)}
              disabled={drawingScope && drawingScope !== drawingLocation}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs disabled:bg-gray-50"
            >
              <option value="">Choose building</option>
              {availableLocations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
        )}
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Drawing month</span>
          <input
            type="month"
            value={drawingMonth}
            onChange={event => setDrawingMonth(event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs"
          />
        </label>
      </div>

      {monthlyWinner ? (
        <div className="mt-4 rounded-xl border border-amber-300 bg-gradient-to-br from-amber-50 to-[#fff4c4] p-4 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Recorded winner</p>
          <p className="mt-2 text-lg font-black text-gray-950">★ {employeeName(monthlyWinnerEmployee) || monthlyWinner.employeeId}</p>
          <p className="mt-1 text-xs text-gray-500">{formatMonth(drawingMonth)} - {LOCATION_MAP[drawingScope]?.name || drawingScope}</p>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-center">
              <p className="text-lg font-black text-gray-900">{entries.length}</p>
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Drawing entries</p>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-center">
              <p className="text-lg font-black text-gray-900">{uniqueCandidates}</p>
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Candidates</p>
            </div>
          </div>
          {canEdit && (
            <>
              <button
                type="button"
                onClick={onDraw}
                disabled={!drawingScope || entries.length === 0 || !drawingAvailability.isOpen}
                className="mt-3 w-full rounded-lg bg-[#211b12] px-3 py-2.5 text-xs font-black uppercase tracking-wide text-[#ffd75c] hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                Draw and record winner
              </button>
              {!drawingAvailability.isOpen && (
                <p className="mt-2 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-[11px] font-semibold leading-relaxed text-sky-800">
                  {drawingAvailability.opensOn
                    ? `Entries remain visible. The drawing button opens during the final seven days of the selected month (${formatDate(drawingAvailability.opensOn)}).`
                    : 'Choose a valid drawing month to see its entries and drawing window.'}
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}

function ShootingStarNominations({ records, employeeMap, quarterLabel }) {
  return (
    <section className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-sky-100 text-xl" aria-hidden="true">☄️</span>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-700">Quarterly review · {quarterLabel}</p>
          <h2 className="all-star-display mt-1 text-xl uppercase text-gray-950">Shooting Star Nominations</h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">Nominations put employees in the running for quarterly review. They do not add an earned star or monthly drawing entry.</p>
        </div>
      </div>
      {records.length ? (
        <div className="mt-4 divide-y divide-sky-100 rounded-xl border border-sky-100 bg-sky-50/40 px-3">
          {records.slice(0, 6).map(record => {
            const employee = employeeMap.get(String(record.employeeId))
            return (
              <div key={record.id} className="py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-black text-gray-900">{employeeName(employee) || record.employeeId}</p>
                  <span className="text-[10px] text-gray-400">{formatDate(record.date)}</span>
                </div>
                {record.criteria?.length > 0 && <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{record.criteria.join(' · ')}</p>}
              </div>
            )
          })}
          {records.length > 6 && <p className="py-2 text-center text-[10px] font-bold uppercase tracking-wide text-sky-700">+ {records.length - 6} more nominations this quarter</p>}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-sky-200 bg-sky-50/50 px-3 py-5 text-center text-xs text-sky-800">No Shooting Star nominations have been submitted for this quarter.</p>
      )}
    </section>
  )
}

function AceBucksCard() {
  return (
    <section className="rounded-2xl border border-[#d7b44b] bg-gradient-to-br from-[#f7df88] via-[#d9b64f] to-[#a97420] p-[1px] shadow-sm">
      <div className="rounded-[15px] bg-[#201a11] p-5 text-white">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#f1cf69]">★ Manager program</p>
        <h2 className="all-star-display mt-1 text-2xl uppercase">ACE Bucks</h2>
        <p className="mt-2 text-xs leading-relaxed text-white/70">Managers earn ACE Bucks for leadership, operational excellence, innovation, team development, food safety, customer service, and support of district goals.</p>
        <p className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-amber-100/75">Tracking values are intentionally pending: the source defines the program but does not assign buck amounts or redemption values.</p>
      </div>
    </section>
  )
}

function RecentRecognition({ records, employeeMap }) {
  const recent = records.slice(0, 10)
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-[#9a651b]">All-Star board</p>
      <h2 className="all-star-display mt-1 text-2xl uppercase text-gray-950">Recent Recognition</h2>
      {recent.length ? (
        <div className="mt-4 divide-y divide-gray-100">
          {recent.map(record => {
            const employee = employeeMap.get(String(record.employeeId))
            const type = RECOGNITION_TYPE_MAP[record.type]
            return (
              <div key={record.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-lg text-[#d9aa32]" aria-hidden="true">★</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link to={`/employee/${record.employeeId}`} className="text-sm font-bold text-gray-900 hover:text-[#9a651b]">
                          {employeeName(employee) || record.employeeId}
                        </Link>
                        <p className="mt-0.5 text-xs font-semibold text-[#a36d1d]">{type?.label || record.type}</p>
                      </div>
                      <span className="flex-none text-[11px] text-gray-400">{formatDate(record.date)}</span>
                    </div>
                    {record.criteria?.length > 0 && <p className="mt-1.5 text-xs text-gray-500">{record.criteria.join(' - ')}</p>}
                    {record.note && <p className="mt-1 text-xs italic text-gray-600">“{record.note}”</p>}
                    <p className="mt-1.5 text-[10px] text-gray-400">
                      {LOCATION_MAP[record.locationId]?.name || record.locationId}
                      {record.sourceName ? ` - Submitted by ${record.sourceName}` : ''}
                      {record.recognizedBy ? ` - Recorded by ${record.recognizedBy}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">No recognitions have been recorded in this view yet.</p>
      )}
    </section>
  )
}

function AnnualCelebration() {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#d7b44b] bg-white shadow-sm">
      <div className="bg-[#17130d] px-5 py-5 text-center text-white sm:px-6">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#e3b93f]">Annual Employee Appreciation Day</p>
        <h2 className="all-star-display mt-2 text-3xl uppercase">All-Star Celebration</h2>
        <p className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-white/65">Awards celebrate overall star recognition and performance in key areas of excellence.</p>
      </div>
      <div className="grid gap-px bg-amber-100 sm:grid-cols-2">
        {ANNUAL_AWARD_CATEGORIES.map(category => (
          <div key={category.name} className="bg-white px-4 py-3">
            <p className="text-sm font-black text-gray-900">🏆 {category.name}</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">{category.description}</p>
          </div>
        ))}
        <div className="bg-[#fff8df] px-4 py-3">
          <p className="text-sm font-black text-[#9a651b]">★ & More</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">Final award decisions remain performance-based; the source does not prescribe an automatic formula.</p>
        </div>
      </div>
    </section>
  )
}
