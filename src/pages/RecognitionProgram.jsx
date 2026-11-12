import { Fragment, useMemo, useState } from 'react'
import { useProgramTerms } from '../components/useProgramTerms.js'
import { Link } from 'react-router-dom'
import { useAuth } from '../components/PinGate.jsx'
import AllStarBanner from '../components/AllStarBanner.jsx'
import { getEmployeesWithEffectiveLocations } from '../data/employeeLocations.js'
import { openStarCardWindow, starCardPreviewHtml } from '../lib/starCardPrinting.js'
import { LOCATIONS, LOCATION_MAP } from '../data/locations.js'
import {
  ANNUAL_AWARD_CATEGORIES,
  RECOGNITION_CRITERIA,
  RECOGNITION_CRITERIA_DESCRIPTIONS,
  criterionLabel,
  RECOGNITION_TYPE_MAP,
  RECOGNITION_TYPES,
  recognitionAccent,
  gradeAccent,
  teamRecognitionCoverage,
  toStarCardEntries,
  buildingRecognitionSummary,
  buildingMonthlyRecipients,
  schoolYearMonthKeys,
  kitchenManagerIds,
  managerEmployeeIds,
  addRecognition,
  addRecognitionGroup,
  createRecognitionRecord,
  drawMonthlyAllStar,
  existingMonthlyWinner,
  getAllRecognitions,
  getAceBuckCount,
  getMonthlyDrawingEntries,
  earnsDailyStar,
  EMPLOYEE_OF_MONTH_TYPE,
  RECOGNITION_STORAGE_KEY,
  editEmployeeOfMonth,
  editMonthlyWinner,
  employeeOfMonthClash,
  employeesOfMonth,
  redrawExcludedEmployeeIds,
  removeEmployeeOfMonth,
  removeMonthlyWinner,
  replaceMonthlyWinner,
  setAsideEntries,
  requiresStarMessage,
  schoolYearStartFor,
  DISTRICT_SUBMITTER_ID,
  OTHER_REASON,
} from '../data/recognitionStore.js'
import {
  monthlyDrawingStatus,
  quarterWindowFor,
  recognitionRecipients,
  recognitionTypeAllowedForRole,
} from '../data/recognitionRules.js'
import { coachMilestones, starLevels } from '../data/programSettings.js'
import { flushPendingWrites, loadSharedState } from '../data/sharedStore.js'

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

// A name for a recognition, never a payroll number. Somebody nobody can name
// at all — an app-added employee since deleted — reads as a former employee
// rather than as a string of digits.
function recognitionName(nameMap, employeeId, fallback = '') {
  return employeeName(nameMap.get(String(employeeId))) || fallback || 'Former employee'
}

// The picker is a lookup list, so it reads "Last, First" like the Employee
// Records ledger — that is what makes its alphabetical order visible on screen.
// Star cards, the team list and confirmations stay on employeeName's
// "First Last" so the recognition copy still reads like a person's name.
function employeeListName(employee) {
  const lastName = String(employee?.last_name || '').trim()
  const firstName = String(employee?.first_name || '').trim()
  if (!lastName) return firstName
  return firstName ? `${lastName}, ${firstName}` : lastName
}

// The split applies to every month. The earlier worry — that switching it
// on mid-September would rewrite a month buildings had already drawn — does
// not hold: handleMonthlyDrawing refuses a month that already has a winner,
// so a recorded result can never change. Only buildings that have not drawn
// yet are affected, which is the new rule doing its job. Leaving it until
// October would have been worse: the Manager Leaderboard is live now, so a
// September draw could still hand the building award to a lead standing in
// the manager pool on the same screen.
const MANAGER_SPLIT_STARTS_ON = '2026-07'

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

// A timestamp rather than a date key, read in local time: a redraw at eight
// in the evening is that day's, not tomorrow's in UTC.
function formatMoment(isoValue) {
  const date = new Date(isoValue)
  if (Number.isNaN(date.valueOf())) return ''
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function drawingNote(result) {
  return `Selected from ${result.totalEntries} building entr${result.totalEntries === 1 ? 'y' : 'ies'}; ${result.entryCount} belonged to this employee.`
}

// Opens the card in its own window and sends it straight to the print dialog.
// The card is written into a fresh document rather than printed from this page
// so the app's own layout can never bleed into the printed sheet.






function emptyRecognitionForm(type) {
  // employeeIds, plural, because a Star of the Day may be given to several
  // people at once — Liz, 2026-10-27. Every other surface uses exactly one
  // and the array simply never grows past it.
  return { employeeIds: [], type, date: localDateKey(), criteria: [], otherReason: '', note: '', sourceName: '' }
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
    recognitionOnly,
    dataVersion,
  } = access
  const [localVersion, setLocalVersion] = useState(0)
  const [savingWinner, setSavingWinner] = useState(false)
  const [employeeOfMonthMonth, setEmployeeOfMonthMonth] = useState(localDateKey().slice(0, 7))
  const [scopeLocation, setScopeLocation] = useState(role === 'school' ? locationId : 'all')
  const [historyType, setHistoryType] = useState('all')
  // Which half of the board panel is showing. Lifted out of the panel
  // because the command centre links straight to the feed, and that link
  // has to be able to open the tab it is pointing at.
  const [boardTab, setBoardTab] = useState('feed')
  const [drawingLocation, setDrawingLocation] = useState(role === 'school' ? locationId : '')
  const [drawingMonth, setDrawingMonth] = useState(localDateKey().slice(0, 7))
  const [pendingPreview, setPendingPreview] = useState(null)
  // Two separate entry surfaces. Star of the Day is the daily job and owns the
  // main column; nominations and shout-outs are occasional extras and live in
  // the side panel, so the two never compete for a manager's attention.
  const [starForm, setStarForm] = useState(() => emptyRecognitionForm('star-of-day'))
  const [bonusForm, setBonusForm] = useState(() => emptyRecognitionForm(''))
  const [aceForm, setAceForm] = useState(() => emptyRecognitionForm('ace-buck'))
  const [feedback, setFeedback] = useState(null)
  const [submittingSurface, setSubmittingSurface] = useState(null)
  const [confirmations, setConfirmations] = useState({ star: null, bonus: null, ace: null })

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
  // For naming people on recognitions already given, which outlive their
  // time on the active roster. Jon, 2026-10-30: somebody deactivated showed
  // in the feed as their payroll number. employeeMap stays the active roster
  // for anything that chooses or draws a person; this one only ever names.
  const nameMap = useMemo(
    () => new Map(
      getEmployeesWithEffectiveLocations({ includeInactive: true })
        .map(employee => [employeeKey(employee), employee])
    ),
    [dataVersion, localVersion]
  )
  // The eighteen who run the kitchens. Read from the roster rather than
  // stored on records, so every star they have already earned counts in
  // their own pool without a single live record being rewritten.
  const managerIds = useMemo(() => managerEmployeeIds(employees), [employees])
  // Who may receive an ACE Coach Buck: the fifteen running kitchens. The
  // district office is manager-grade, but does not collect the currency it
  // hands out.
  const aceEligibleIds = useMemo(() => kitchenManagerIds(employees), [employees])
  const availableLocations = useMemo(() => {
    const ids = new Set(employees.map(employee => employee.location).filter(Boolean))
    return LOCATIONS.filter(location => ids.has(location.id))
  }, [employees])
  const scopedEmployees = scopeLocation === 'all'
    ? employees
    : employees.filter(employee => employee.location === scopeLocation)
  // Manager-grade staff the current view does NOT already include. A
  // building session is scoped to its own school, so without this the
  // Shout-Out picker offers only that school's own lead — which is what it
  // did when this first shipped. The server sends these eighteen to every
  // session precisely so they can be chosen.
  const scopedKeys = new Set(scopedEmployees.map(employeeKey))
  const peerManagers = employees.filter(employee =>
    managerIds.has(employeeKey(employee)) && !scopedKeys.has(employeeKey(employee)))
  // Liz, 2026-10-26: "make the Warren Star Shout Outs visible across all
  // feeds since they are able to do peer to peer recognitions." A shout-out
  // is filed against the recipient's building, so narrowing the view used
  // to hide the ones this manager gave to somebody at another school.
  //
  // Done here rather than only in the feed so the shout-out count on the
  // banner describes what the link under it opens. Nothing else on the page
  // moves: stars, nominations, drawings and the building table all filter
  // by their own type or by an explicit list of buildings.
  const scopedRecords = scopeLocation === 'all'
    ? records
    : records.filter(record => (
      record.locationId === scopeLocation || record.type === 'star-shout-out'
    ))

  const schoolYearStart = schoolYearStartFor(new Date())
  const schoolYearRecords = scopedRecords.filter(record => (
    record.date >= `${schoolYearStart}-07-01` && record.date <= `${schoolYearStart + 1}-06-30`
  ))
  const earnedStars = schoolYearRecords.filter(earnsDailyStar)
  const thisMonth = localDateKey().slice(0, 7)
  const thisMonthStars = earnedStars.filter(record => record.date.startsWith(`${thisMonth}-`))
  // Everyone caught shining this month, pinned to the banner the way their
  // paper cards go up on the board. One pin each, in name order: since
  // 2026-11-11 the board shows who was noticed, not who was noticed most.
  const pinnedStars = useMemo(() => {
    const byEmployee = new Map()
    for (const record of thisMonthStars) {
      const id = String(record.employeeId)
      if (!byEmployee.has(id)) byEmployee.set(id, { id, name: recognitionName(nameMap, id) })
    }
    return [...byEmployee.values()].sort((left, right) => left.name.localeCompare(right.name))
  }, [thisMonthStars, nameMap])
  const recognizedPeople = new Set(earnedStars.map(record => record.employeeId)).size
  const compilation = {
    dailyStars: schoolYearRecords.filter(record => record.type === 'star-of-day').length,
    shoutOuts: schoolYearRecords.filter(record => record.type === 'star-shout-out').length,
    shootingNominations: schoolYearRecords.filter(record => record.type === 'shooting-star').length,
    employeeOfMonth: schoolYearRecords.filter(record => record.type === 'warren-employee-month').length,
    buildingAllStars: schoolYearRecords.filter(record => record.type === 'all-star-of-month').length,
  }

  // Jon, 2026-11-11: no leaderboards. The staff and manager boards ranked
  // people by star count, and recognition had started to read as a contest.
  // In their place, everybody in the current view in name order: who has
  // been recognized this month, who has not yet, and how far each person is
  // from their own next level.
  const byName = (left, right) => employeeName(left.employee).localeCompare(employeeName(right.employee))
  const teamCoverage = teamRecognitionCoverage(records, scopedEmployees, {
    monthKey: thisMonth,
    startYear: schoolYearStart,
  }).sort(byName)

  // The Leadership Track, counted in ACE Coach Bucks against the coach
  // milestones. District-only for now, so it is built but not handed to the
  // page unless the session is an administrator. Every eligible manager is
  // listed, in name order, including those with none yet — the same rule as
  // the team list, so this is progress, not standings.
  const coachLevels = coachMilestones()
  const coachProgress = employees
    .filter(employee => aceEligibleIds.has(employeeKey(employee)))
    .map(employee => {
      const count = getAceBuckCount(records, employeeKey(employee), schoolYearStart)
      const nextLevel = coachLevels.find(level => count < level.minimum) || null
      return {
        employee,
        level: [...coachLevels].reverse().find(level => count >= level.minimum) || null,
        nextLevel,
        toNextLevel: nextLevel ? nextLevel.minimum - count : 0,
      }
    })
    .sort(byName)
  const bonusTypes = BONUS_RECOGNITION_TYPES.filter(type =>
    recognitionTypeAllowedForRole(role, type, canManageRecognitionAwards))
  // Buildings in the current view, named even when they have recognized
  // nobody — an empty row is the signal worth seeing.
  const buildingCounts = buildingRecognitionSummary(
    schoolYearRecords,
    schoolYearStart,
    (scopeLocation === 'all' ? availableLocations.map(location => location.id) : [scopeLocation])
  )
  // July through the month we are in: a table of empty columns for months
  // that have not happened yet is just noise.
  const boardMonths = schoolYearMonthKeys(schoolYearStart).filter(month => month <= thisMonth)
  const drawingScope = role === 'school' ? locationId : (scopeLocation !== 'all' ? scopeLocation : drawingLocation)
  const splitApplies = drawingMonth >= MANAGER_SPLIT_STARTS_ON
  const drawingEntriesBeforeSplit = drawingScope
    ? getMonthlyDrawingEntries(records, drawingScope, drawingMonth)
    : []
  const drawingEntries = drawingScope
    ? getMonthlyDrawingEntries(records, drawingScope, drawingMonth, splitApplies ? managerIds : null)
    : []
  const monthlyWinner = drawingScope ? existingMonthlyWinner(records, drawingScope, drawingMonth) : null
  const monthlyWinnerEmployee = monthlyWinner ? nameMap.get(String(monthlyWinner.employeeId)) : null
  // The same people the server sends a redraw's history to (state.mjs,
  // canSeeRedrawHistory), so the button never offers something the server
  // would strip on the way in.
  const canRedraw = canEditRecognition && role === 'admin' && recognitionOnly !== true
  const redrawEntries = monthlyWinner
    ? getMonthlyDrawingEntries(
      records,
      drawingScope,
      drawingMonth,
      redrawExcludedEmployeeIds(monthlyWinner, splitApplies ? managerIds : null)
    )
    : []
  const setAside = setAsideEntries(monthlyWinner).map(entry => ({
    ...entry,
    name: recognitionName(nameMap, entry.employeeId),
  }))
  const drawingAvailability = monthlyDrawingStatus(drawingMonth)
  const nominationQuarter = quarterWindowFor(new Date())
  const shootingStarNominations = scopedRecords.filter(record => (
    record.type === 'shooting-star'
    && record.date >= nominationQuarter.start
    && record.date <= nominationQuarter.end
  ))

  const surfaceSetters = { star: setStarForm, bonus: setBonusForm, ace: setAceForm }
  const clearConfirmation = surface => setConfirmations(current => ({ ...current, [surface]: null }))
  const setFormValue = (surface, name, value) => {
    clearConfirmation(surface)
    surfaceSetters[surface](current => (
      // Reasons are per-type, so switching type must drop the previous
      // selections rather than silently carrying invalid ones forward.
      name === 'type'
        ? { ...current, type: value, criteria: [], otherReason: '', sourceName: '' }
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
      // Unticking Other clears what was typed against it, so it cannot
      // reappear if the box is ticked again for a different reason.
      ...(criterion === OTHER_REASON && current.criteria.includes(OTHER_REASON)
        ? { otherReason: '' }
        : {}),
    }))
  }

  // card is the printable Star of the Day payload, or null for the surfaces that
  // do not produce one. It rides on the confirmation so the Print button stays
  // available after the form has been cleared for the next entry.
  const finishConfirmedSubmission = (surface, message, card = null) => {
    surfaceSetters[surface](current => ({
      ...current,
      employeeIds: [],
      criteria: [],
      otherReason: '',
      note: '',
      sourceName: '',
      // The bonus panel folds back up; the other two have a fixed type.
      ...(surface === 'bonus' ? { type: '' } : {}),
    }))
    setLocalVersion(version => version + 1)
    setFeedback({ type: 'success', message })
    setConfirmations(current => ({
      ...current,
      [surface]: { type: 'saved', message: `${message} The shared record is confirmed.`, card },
    }))
  }

  // Prints every Star of the Day currently in view as a cut-and-pin sheet.
  // Nominations and shout-outs are skipped: the board is a Star of the Day
  // board, and toStarCardEntries drops them.
  // Liz asked to see the card before it is recorded. Validation runs first,
  // so a preview can never show a card that then fails to save — the point
  // is to approve exactly what gets written and printed.
  const beginSubmit = (surface, form, event) => {
    event.preventDefault()
    setFeedback(null)
    clearConfirmation(surface)
    try {
      const chosen = (form.employeeIds || [])
        .map(id => employeeMap.get(String(id)))
        .filter(Boolean)
      if (!chosen.length) throw new Error('Choose an employee from your available roster.')
      if (!recognitionTypeAllowedForRole(role, form.type, canManageRecognitionAwards)) {
        throw new Error('Only a district administrator can record Warren Food Services Employee of the Month.')
      }
      const draft = createRecognitionRecord({
        ...form,
        employeeId: String(chosen[0].kronos_id || chosen[0].id),
        locationId: chosen[0].location,
        recognizedBy: displayName || 'Authenticated manager',
        recognizedByLocationId: role === 'school' ? locationId : DISTRICT_SUBMITTER_ID,
      })
      if (draft.type === 'star-of-day') {
        // The preview is the card that will print, so for a group it shows
        // every name — approving something that names one person and
        // printing something that names five is the one thing this step
        // exists to prevent.
        setPendingPreview({
          surface,
          employeeName: chosen.map(employeeName).join(', '),
          starCount: chosen.length,
          card: {
            name: chosen.map(employeeName).join(', '),
            names: chosen.map(employeeName),
            date: draft.date,
            criteria: draft.criteria,
            otherReason: draft.otherReason,
            message: draft.note,
            recognizedBy: draft.recognizedBy,
          },
        })
        return
      }
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
      return
    }
    submitRecognition(surface, form)
  }

  const confirmPreview = async () => {
    if (!pendingPreview) return
    const { surface } = pendingPreview
    setPendingPreview(null)
    const forms = { star: starForm, bonus: bonusForm, ace: aceForm }
    await submitRecognition(surface, forms[surface])
  }

  const handlePrintSheet = visibleRecords => {
    const cards = toStarCardEntries(visibleRecords, id => recognitionName(nameMap, id))
    if (!cards.length) {
      setFeedback({ type: 'error', message: 'There are no Star of the Day cards to print in this view.' })
      return
    }
    if (!openStarCardWindow(cards, { pad: true })) {
      setFeedback({ type: 'error', message: 'Your browser blocked the print window. Allow pop-ups for this site, then try again.' })
    }
  }

  const handlePrintCard = surface => {
    const card = confirmations[surface]?.card
    if (!card) return
    if (!openStarCardWindow([card])) {
      setFeedback({
        type: 'error',
        message: 'Your browser blocked the print window. Allow pop-ups for this site, then use Print star card again.',
      })
    }
  }

  // flushPendingWrites drops a write the server refuses outright and reports
  // it in what it returns, rather than throwing. Until 2026-10-30 nothing
  // here looked, so a refused award still said "The shared record is
  // confirmed." A refusal is not a connection problem — retrying will not
  // help — so it is marked and handled apart from one.
  const confirmRecognitionSaved = async () => {
    const discarded = await flushPendingWrites()
    const refused = (discarded || []).find(entry => entry.key === RECOGNITION_STORAGE_KEY)
    if (refused) {
      const error = new Error(refused.message || 'The server would not accept that change. Nothing has been saved.')
      error.refused = true
      throw error
    }
  }

  const submitRecognition = async (surface, form, event) => {
    event?.preventDefault()
    setFeedback(null)
    clearConfirmation(surface)
    setSubmittingSurface(surface)
    let confirmationMessage = ''
    let card = null
    try {
      if (!recognitionTypeAllowedForRole(role, form.type, canManageRecognitionAwards)) {
        throw new Error('Only a district administrator can record Warren Food Services Employee of the Month.')
      }
      const chosen = (form.employeeIds || [])
        .map(id => employeeMap.get(String(id)))
        .filter(Boolean)
      if (!chosen.length) throw new Error('Choose an employee from your available roster.')
      // One for the whole district each month — see employeesOfMonth.
      if (form.type === EMPLOYEE_OF_MONTH_TYPE) {
        const monthKey = String(form.date || '').slice(0, 7)
        const existing = employeeOfMonthClash(records, monthKey)
        if (existing) {
          throw new Error(`${recognitionName(nameMap, existing.employeeId)} is already Employee of the Month for ${formatMonth(monthKey)}. Edit or remove that one first in the Employee of the Month box.`)
        }
      }

      // One record each, tied by a group id when there is more than one.
      // Liz, 2026-10-27: five people who did something together earn five
      // stars and print one card.
      const records = addRecognitionGroup(
        {
          ...form,
          recognizedBy: displayName || 'Authenticated manager',
          recognizedByLocationId: role === 'school' ? locationId : DISTRICT_SUBMITTER_ID,
        },
        chosen.map(employee => ({
          employeeId: String(employee.kronos_id || employee.id),
          locationId: employee.location,
        })),
      )
      const record = records[0]
      const who = chosen.length === 1
        ? employeeName(chosen[0])
        : `${chosen.slice(0, -1).map(employeeName).join(', ')} and ${employeeName(chosen.at(-1))}`
      confirmationMessage = record.type === 'shooting-star'
        ? `${who} was added to the quarterly Shooting Star nominations.`
        : chosen.length === 1
          ? `${who} received ${RECOGNITION_TYPE_MAP[record.type].label}.`
          : record.type === 'ace-buck'
            ? `${chosen.length} ACE Coach Bucks recorded, one each for ${who}.`
            : `${chosen.length} stars recorded, one each for ${who}. The card names all of them.`
      // Only the daily star has a printable card: the physical board is a Star
      // of the Day board, and a nomination is not an award yet.
      card = record.type === 'star-of-day'
        ? {
          name: chosen.map(employeeName).join(', '),
          names: chosen.map(employeeName),
          date: record.date,
          criteria: record.criteria,
          otherReason: record.otherReason,
          message: record.note,
          recognizedBy: record.recognizedBy,
        }
        : null
      await confirmRecognitionSaved()
      finishConfirmedSubmission(surface, confirmationMessage, card)
    } catch (error) {
      if (error.refused) {
        await loadSharedState().catch(() => undefined)
        setLocalVersion(version => version + 1)
        setFeedback({ type: 'error', message: error.message })
      } else if (confirmationMessage) {
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
      await confirmRecognitionSaved()
      finishConfirmedSubmission(surface, confirmation.confirmationMessage, confirmation.card)
    } catch (error) {
      if (error.refused) {
        await loadSharedState().catch(() => undefined)
        setLocalVersion(version => version + 1)
        setFeedback({ type: 'error', message: error.message })
        clearConfirmation(surface)
        return
      }
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
      const result = drawMonthlyAllStar(records, drawingScope, drawingMonth, undefined, splitApplies ? managerIds : null)
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
        note: drawingNote(result),
        recognizedBy: displayName || 'Authenticated manager',
      })
      setLocalVersion(version => version + 1)
      setFeedback({ type: 'success', message: `${employeeName(winner)} is ${formatMonth(drawingMonth)} All-Star of the Month.` })
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    }
  }

  // See replaceMonthlyWinner for why the person drawn is set aside rather
  // than put back in.
  // Redraw, edit and remove all change what a month holds, and all three are
  // awaited. prepare() checks everything it can and throws before anything
  // is written; only then is the save attempted. If the server refuses, the
  // change is already on this screen, so put back what the server actually
  // holds rather than leave a winner showing that nobody else will see.
  const saveWinnerChange = async prepare => {
    setFeedback(null)
    setSavingWinner(true)
    let saving = false
    try {
      const { save, message } = prepare()
      saving = true
      await save()
      setFeedback({ type: 'success', message })
    } catch (error) {
      if (saving) await loadSharedState().catch(() => undefined)
      setFeedback({ type: 'error', message: error.message })
    } finally {
      setLocalVersion(version => version + 1)
      setSavingWinner(false)
    }
  }

  const handleRedraw = () => saveWinnerChange(() => {
    if (!monthlyWinner) throw new Error('There is no recorded winner to redraw.')
    const excluded = redrawExcludedEmployeeIds(monthlyWinner, splitApplies ? managerIds : null)
    const result = drawMonthlyAllStar(records, drawingScope, drawingMonth, undefined, excluded)
    if (!result) throw new Error('Nobody else has a Star of the Day entry this month, so there is no one to redraw.')
    const winner = employeeMap.get(String(result.employeeId))
    if (!winner) throw new Error('The selected employee is not available in this roster.')
    return {
      save: () => replaceMonthlyWinner(monthlyWinner, {
        employeeId: result.employeeId,
        date: monthAwardDate(drawingMonth),
        criteria: [],
        note: drawingNote(result),
        recognizedBy: displayName || 'Authenticated manager',
      }, { setAsideBy: displayName || 'District administrator' }),
      message: `${employeeName(winner)} is ${formatMonth(drawingMonth)} All-Star of the Month.`,
    }
  })

  // Jon, 2026-10-30: "she needs to be able to edit those fully she put one
  // in the wrong month." See editMonthlyWinner.
  const handleEditWinner = ({ employeeId, locationId, monthKey }) => saveWinnerChange(() => {
    if (!monthlyWinner) throw new Error('There is no recorded winner to edit.')
    if (!monthlyDrawingStatus(monthKey).isOpen) {
      throw new Error(`${formatMonth(monthKey)} has not reached its drawing week yet.`)
    }
    const person = employeeMap.get(String(employeeId))
    if (!person) throw new Error('Choose who won.')
    const clash = existingMonthlyWinner(records, locationId, monthKey)
    if (clash && clash.id !== monthlyWinner.id) {
      throw new Error(`${LOCATION_MAP[locationId]?.name || locationId} already has a recorded winner for ${formatMonth(monthKey)}. Remove that one first.`)
    }
    const personChanged = String(employeeId) !== String(monthlyWinner.employeeId)
    const buildingName = LOCATION_MAP[locationId]?.name || locationId
    return {
      save: async () => {
        await editMonthlyWinner(monthlyWinner, {
          employeeId,
          locationId,
          monthKey,
          // A drawn note says how many entries the draw came from, which
          // stops being true of somebody chosen by hand.
          ...(personChanged ? { note: 'Recorded by the district.' } : {}),
        }, { updatedBy: displayName || 'District administrator' })
        // Follow the winner to where it now lives, so the panel shows the
        // change rather than an empty month.
        if (role === 'admin' && scopeLocation === 'all') setDrawingLocation(locationId)
        setDrawingMonth(monthKey)
      },
      message: `${employeeName(person)} is now ${formatMonth(monthKey)} All-Star of the Month for ${buildingName}.`,
    }
  })

  const handleRemoveWinner = () => saveWinnerChange(() => {
    if (!monthlyWinner) throw new Error('There is no recorded winner to remove.')
    return {
      save: () => removeMonthlyWinner(monthlyWinner),
      message: `${formatMonth(drawingMonth)} has no recorded winner for ${LOCATION_MAP[drawingScope]?.name || drawingScope} now, and can be drawn again.`,
    }
  })

  // Jon, 2026-10-30: Warren Food Services Employee of the Month is one
  // person for the whole district each month, chosen by the district — see
  // employeesOfMonth. Corrected here: person, date, reasons and message.
  const handleEditEmployeeOfMonth = (award, { employeeId, date, criteria, note }) => saveWinnerChange(() => {
    const person = employeeMap.get(String(employeeId))
    if (!person) throw new Error('Choose who was selected.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || date > localDateKey()) {
      throw new Error('Choose a date that has already happened.')
    }
    if (!criteria?.length) throw new Error('Choose what they qualified through.')
    const monthKey = date.slice(0, 7)
    const clash = employeeOfMonthClash(records, monthKey, award.id)
    if (clash) {
      throw new Error(`${recognitionName(nameMap, clash.employeeId)} is already Employee of the Month for ${formatMonth(monthKey)}. Remove that one first.`)
    }
    return {
      save: async () => {
        await editEmployeeOfMonth(award, {
          employeeId,
          locationId: person.location,
          date,
          criteria,
          note,
        }, { updatedBy: displayName || 'District administrator' })
        setEmployeeOfMonthMonth(monthKey)
      },
      message: `${employeeName(person)} is now Warren Food Services Employee of the Month for ${formatMonth(monthKey)}.`,
    }
  })

  const handleRemoveEmployeeOfMonth = award => saveWinnerChange(() => ({
    save: () => removeEmployeeOfMonth(award),
    message: `${formatMonth(String(award.date).slice(0, 7))} no longer has an Employee of the Month recorded.`,
  }))

  // Who may be chosen when a winner is edited by hand: the building's own
  // roster, less the manager pool once the split applies — the same people
  // the drawing itself would consider. Their entry count for that month is
  // shown beside each name, so the choice can still follow the stars.
  const winnerCandidates = (candidateLocationId, monthKey) => {
    const entries = getMonthlyDrawingEntries(records, candidateLocationId, monthKey)
    const counts = new Map()
    entries.forEach(entry => counts.set(String(entry.employeeId), (counts.get(String(entry.employeeId)) || 0) + 1))
    return employees
      .filter(employee => employee.location === candidateLocationId)
      .filter(employee => !(monthKey >= MANAGER_SPLIT_STARTS_ON && managerIds.has(employeeKey(employee))))
      .map(employee => ({
        id: employeeKey(employee),
        name: employeeListName(employee),
        entries: counts.get(employeeKey(employee)) || 0,
      }))
      .sort((left, right) => left.name.localeCompare(right.name))
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#f7f3e9] pb-12">
      <div className="border-b-4 border-[#d5aa3d] bg-black px-3 pb-4 pt-3 sm:px-6 sm:pb-6 sm:pt-5">
        <div className="mx-auto max-w-7xl">
          <AllStarBanner
            starCount={thisMonthStars.length}
            countLabel={`stars · ${formatMonth(thisMonth)}`}
            pinned={pinnedStars}
            emptyNote={`No stars pinned yet for ${formatMonth(thisMonth)} — catch someone shining.`}
          />
        </div>
      </div>

      <StarCardPreview
        preview={pendingPreview}
        submitting={submittingSurface !== null}
        onConfirm={confirmPreview}
        onBack={() => setPendingPreview(null)}
      />

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
              <a href="#recognition-history" onClick={() => { setBoardTab('feed'); setHistoryType('star-shout-out') }} className="rounded text-purple-800 underline underline-offset-4 hover:text-purple-600" aria-label={`View all shout-outs across the district (${compilation.shoutOuts} this school year)`}>
                <SecondaryCount
                  label={scopeLocation === 'all' ? 'Shout-outs' : 'Shout-outs · whole district'}
                  value={compilation.shoutOuts}
                />
              </a>
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

        {/* Liz, 2026-10-19: the page had too many boxes. Split down the
            middle under the command centre — the feed on the left, the thing
            a manager came here to do on the right. Everything that is a
            report rather than an action moved below the fold. */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* Stacked on a narrow screen the feed would come first, which is
              the wrong order for a manager standing in a kitchen with a
              phone: they came to give a star, not to read. The form goes
              first until there is room for both side by side. */}
          <div className="order-2 lg:order-none">
            <BoardPanel
              tab={boardTab}
              onTabChange={setBoardTab}
              feed={
                <RecentRecognition
                  key={`${scopeLocation}-${historyType}`}
                  records={scopedRecords}
                  employeeMap={nameMap}
                  managerIds={managerIds}
                  type={historyType}
                  onTypeChange={setHistoryType}
                  onPrintSheet={handlePrintSheet}
                />
              }
              teamLabel={scopeLocation === 'all' ? 'Teams' : 'Your team'}
              team={
                <TeamCoverage
                  key={scopeLocation}
                  entries={teamCoverage}
                  locations={scopeLocation === 'all' ? availableLocations : null}
                  managerIds={managerIds}
                  monthLabel={formatMonth(thisMonth)}
                />
              }
            />
          </div>

          <div className="space-y-6 order-1 lg:order-none">
            <RecognitionEntryForm
              surface="star"
              form={starForm}
              lockedType="star-of-day"
              title="Star of the Day"
              subtitle="Catch someone shining. This is the daily award that earns stars."
              employees={scopedEmployees}
              peerManagers={peerManagers}
              managerIds={managerIds}
              ownLocationId={locationId}
              canEdit={canEditRecognition}
              isSubmitting={submittingSurface === 'star'}
              confirmation={confirmations.star}
              onFieldChange={setFormValue}
              onToggleCriterion={toggleCriterion}
              onSubmit={event => beginSubmit('star', starForm, event)}
              onRetry={() => handleRetryConfirmation('star')}
              onPrintCard={() => handlePrintCard('star')}
            />

            {bonusTypes.length > 0 && (
              <RecognitionEntryForm
                surface="bonus"
                form={bonusForm}
                selectableTypes={bonusTypes}
                compact
                title="Bonus recognition"
                subtitle="Shooting Star nominations, Warren Star Shout-Outs, and Employee of the Month. Coach Bucks have their own section below."
                employees={scopedEmployees}
                peerManagers={peerManagers}
                managerIds={managerIds}
                ownLocationId={locationId}
                canEdit={canEditRecognition}
                isSubmitting={submittingSurface === 'bonus'}
                confirmation={confirmations.bonus}
                onFieldChange={setFormValue}
                onToggleCriterion={toggleCriterion}
                onSubmit={event => beginSubmit('bonus', bonusForm, event)}
                onRetry={() => handleRetryConfirmation('bonus')}
                onPrintCard={() => handlePrintCard('bonus')}
              />
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            {/* Drawing a monthly winner stays with the district even though
                building managers now record the daily stars that enter it: the
                draw awards a title, it does not catch someone shining. */}
            <MonthlyDrawing
              role={role}
              canEdit={canEditRecognition && role === 'admin'}
              availableLocations={availableLocations}
              drawingLocation={drawingLocation}
              setDrawingLocation={setDrawingLocation}
              drawingMonth={drawingMonth}
              setDrawingMonth={setDrawingMonth}
              drawingScope={drawingScope}
              entries={drawingEntries}
              managerEntriesHeld={drawingEntriesBeforeSplit.length - drawingEntries.length}
              monthlyWinner={monthlyWinner}
              monthlyWinnerEmployee={monthlyWinnerEmployee}
              drawingAvailability={drawingAvailability}
              onDraw={handleMonthlyDrawing}
              canRedraw={canRedraw}
              redrawEntries={redrawEntries}
              setAside={setAside}
              savingWinner={savingWinner}
              onRedraw={handleRedraw}
              onEditWinner={handleEditWinner}
              onRemoveWinner={handleRemoveWinner}
              winnerCandidates={winnerCandidates}
            />
            {/* District-wide, so only a district session has the whole
                picture: a building is sent only its own people's awards,
                and would see an empty month that is not empty. */}
            {role === 'admin' && (
              <EmployeeOfMonthPanel
                monthKey={employeeOfMonthMonth}
                setMonthKey={setEmployeeOfMonthMonth}
                awards={employeesOfMonth(records, employeeOfMonthMonth)}
                employeeMap={nameMap}
                people={employees}
                canEdit={canEditRecognition && canManageRecognitionAwards === true && recognitionOnly !== true}
                saving={savingWinner}
                onEdit={handleEditEmployeeOfMonth}
                onRemove={handleRemoveEmployeeOfMonth}
              />
            )}
          </div>
          <ShootingStarNominations
            records={shootingStarNominations}
            employeeMap={nameMap}
            quarterLabel={nominationQuarter.label}
          />
        </div>

        {role === 'admin' && (
          <AceBucksSection
            coaches={coachProgress}
            schoolYearStart={schoolYearStart}
            coachLevels={coachLevels}
            form={aceForm}
            employees={scopedEmployees}
            peerManagers={peerManagers}
            managerIds={managerIds}
            aceEligibleIds={aceEligibleIds}
            canEdit={canEditRecognition}
            isSubmitting={submittingSurface === 'ace'}
            confirmation={confirmations.ace}
            onFieldChange={setFormValue}
            onToggleCriterion={toggleCriterion}
            onSubmit={event => beginSubmit('ace', aceForm, event)}
            onRetry={() => submitRecognition('ace', aceForm)}
          />
        )}

        <StarActivity
          summary={buildingCounts}
          months={boardMonths}
          schoolYearStart={schoolYearStart}
          records={schoolYearRecords}
          employeeMap={nameMap}
        />
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
  peerManagers = [],
  managerIds,
  aceEligibleIds,
  ownLocationId,
  canEdit,
  isSubmitting,
  confirmation,
  onFieldChange,
  onToggleCriterion,
  onSubmit,
  onRetry,
  onPrintCard,
}) {
  const term = useProgramTerms()
  const currentType = RECOGNITION_TYPE_MAP[form.type]
  const criteriaOptions = RECOGNITION_CRITERIA[form.type] || []
  const messageRequired = requiresStarMessage(form.type)
  // The rest of the form waits on the type, not only the reasons: who can
  // receive a recognition depends on which one it is (a Shout-Out reaches
  // other buildings), so a recipient list shown first would be the wrong one.
  const awaitingType = selectableTypes?.length > 0 && !form.type

  // Who this type can actually be given to. The server drops anything
  // outside these sets, so offering a name it would discard would be a
  // silent failure rather than a refusal.
  const isManager = employee => managerIds?.has(employeeKey(employee)) === true
  const isAceEligible = employee => aceEligibleIds?.has(employeeKey(employee)) === true
  const byName = (left, right) => employeeListName(left).localeCompare(employeeListName(right))

  // Who each type may actually be given to. The server drops anything
  // outside these sets, so offering a name it would discard would look like
  // a save that worked and did nothing.
  //
  //   ACE Coach Buck — kitchen managers only, any building. District award.
  //   Shout-Out      — this building, plus every other building's managers.
  //                    It earns nothing and decides nothing, which is what
  //                    makes it safe to send across a boundary.
  //   everything else — this building only.
  const recipients = recognitionRecipients(form.type, {
    scoped: employees,
    peerManagers,
    isManager,
    isAceEligible,
  }).sort(byName)
  // Liz, 2026-10-27: "from the admin side, it's hard to know which employee
  // belongs where."
  //
  // The building used to be shown only for somebody outside the current
  // scope, which meant it appeared for a manager looking at peers and never
  // for the district office — where the list is a hundred and forty-six
  // names from sixteen buildings and the building is the only thing that
  // tells two Browns apart.
  //
  // Shown whenever the list covers more than one, which is the question it
  // actually answers. A manager picking from their own kitchen still sees
  // plain names.
  // The daily star and the Coach Buck are given to a group: one record each,
  // so every person's own milestone moves. A nomination and a Shout-Out are
  // each about one person by definition.
  //
  // Jon, 2026-10-30: "liz wants to be able to give multiple ACE bucks at
  // once" — the same ask she made for the daily star on 2026-10-27, from
  // the district side.
  const allowsGroup = form.type === 'star-of-day' || form.type === 'ace-buck'
  const isAceBuck = form.type === 'ace-buck'
  const chosenIds = Array.isArray(form.employeeIds) ? form.employeeIds : []

  const recipientsSpanBuildings = new Set(
    recipients.map(employee => String(employee.location || ''))
  ).size > 1

  const recipientLabel = form.type === 'ace-buck'
    ? 'Which leader'
    : form.type === 'star-shout-out' ? 'Who is being thanked' : 'Team member'

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
                  const typeAccent = recognitionAccent(typeId)
                  if (!type) return null
                  return (
                    <label
                      key={typeId}
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm transition-colors ${form.type === typeId ? 'border-[#c28b24] bg-amber-50 ring-1 ring-amber-100' : 'border-gray-200 hover:border-amber-200'}`}
                    >
                      {/* Liz, 2026-10-19: clicking the chosen type again
                          folds the form back up. A radio fires no change
                          event when it is already checked, so the second
                          press is caught on click and clears the type. */}
                      <input
                        type="radio"
                        name={`${surface}-recognition-type`}
                        value={typeId}
                        checked={form.type === typeId}
                        onClick={() => {
                          if (form.type === typeId) onFieldChange(surface, 'type', '')
                        }}
                        onChange={() => onFieldChange(surface, 'type', typeId)}
                        className="mt-0.5 h-4 w-4 border-gray-300 text-amber-600 focus:ring-amber-400"
                      />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5 font-semibold text-gray-900">
                          <span className={typeAccent.mark} aria-hidden="true">{typeAccent.glyph}</span>
                          {term.recognitionLabel(type.id, type.label)}
                          {/* "Peer nominations" rather than "peer to peer":
                              a Shout-Out can also arrive from a student or a
                              teacher, and a badge claiming otherwise would
                              trade one wrong impression for another. */}
                          {typeId === 'star-shout-out' && (
                            <span className="rounded-full border border-[#c28b24] bg-amber-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#7a4b12]">
                              Peer nominations
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-gray-500">{type.description}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {awaitingType && (
            <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-xs text-gray-500">
              Choose a recognition above and the rest of the form will open.
            </p>
          )}

          {!awaitingType && <>
          {/* A Shout-Out is the one recognition anybody can give to anybody,
              including across buildings. Liz, 2026-10-19: say so where the
              person is choosing, not in the description they have already
              read past. */}
          {form.type === 'star-shout-out' && (
            <p className="rounded-lg border border-[#c28b24] bg-amber-50 px-3 py-2.5 text-xs font-semibold text-[#7a4b12]">
              <span className="mr-1" aria-hidden="true">★</span>
              A Shout-Out can come from a student, teacher, staff member, or another manager — and a manager
              can nominate a peer manager. The list below is your own team plus managers from every building.
            </p>
          )}

          <div className={compact ? 'space-y-4' : 'grid gap-4 md:grid-cols-2'}>
            {/* A Star of the Day may go to several people at once — Liz,
                2026-10-27: "if 5 out of 10 employees in the kitchen did
                something great and you want to reward the group with one
                recognition card but it would mark an individual star
                each." A Coach Buck since 2026-10-30, likewise. Everything
                else is one person, and stays a plain dropdown rather than
                a tick list of one. */}
            {allowsGroup ? (
              <div className="block">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{recipientLabel}</span>
                  <span className="text-[11px] text-gray-400">
                    {isAceBuck ? 'Tick every leader this buck is for' : 'Tick everyone this star is for'}
                  </span>
                </div>
                <div className="mt-1.5 max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-gray-200 p-1.5">
                  {recipients.length === 0 && (
                    <p className="px-2 py-3 text-xs text-gray-400">Nobody on this roster yet.</p>
                  )}
                  {recipients.map(employee => {
                    const id = employeeKey(employee)
                    const ticked = chosenIds.includes(id)
                    return (
                      <label
                        key={id}
                        className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                          ticked ? 'bg-amber-50 text-[#7a4b12]' : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={ticked}
                          onChange={() => onFieldChange(
                            surface,
                            'employeeIds',
                            ticked ? chosenIds.filter(value => value !== id) : [...chosenIds, id],
                          )}
                          className="rounded border-gray-300 text-[#c28b24] focus:ring-amber-300"
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {employeeListName(employee)}
                          {recipientsSpanBuildings && employee.location
                            ? ` — ${LOCATION_MAP[employee.location]?.name || employee.location}`
                            : ''}
                        </span>
                      </label>
                    )
                  })}
                </div>
                {/* Said before saving, not after. Five stars is five
                    drawing entries, and that should never be a surprise. */}
                <p className="mt-1.5 text-[11px] text-gray-500">
                  {chosenIds.length === 0
                    ? 'Nobody chosen yet.'
                    : isAceBuck
                      ? chosenIds.length === 1
                        ? 'One Coach Buck.'
                        : `${chosenIds.length} Coach Bucks — one each, counting toward their own ACE Coach milestones.`
                      : chosenIds.length === 1
                        ? 'One star, one card.'
                        : `${chosenIds.length} stars — one each, counting toward their own milestones and the monthly drawing. One card, naming all ${chosenIds.length}.`}
                </p>
              </div>
            ) : (
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{recipientLabel}</span>
              <select
                required
                value={chosenIds[0] || ''}
                onChange={event => onFieldChange(surface, 'employeeIds', event.target.value ? [event.target.value] : [])}
                className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:border-[#c28b24] focus:outline-none focus:ring-2 focus:ring-amber-100"
              >
                <option value="">Choose an employee</option>
                {recipients.map(employee => (
                  <option key={employeeKey(employee)} value={employeeKey(employee)}>
                    {employeeListName(employee)}
                    {recipientsSpanBuildings && employee.location
                      ? ` — ${LOCATION_MAP[employee.location]?.name || employee.location}`
                      : ''}
                  </option>
                ))}
              </select>
            </label>
            )}
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
                  : form.type === 'ace-buck'
                    ? 'What they did as a leader'
                    : form.type === 'warren-employee-month' ? 'Why they were selected' : 'Why they shine'}
              </span>
              <span className="text-[11px] font-semibold text-[#9a651b]">Pick at least one</span>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
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
                    {/* Named first, then explained — the same shape as the
                        printed card, so choosing on screen and choosing on
                        paper feel like the same task. */}
                    <span>
                      <span className="block font-semibold uppercase tracking-wide text-[#9a651b]">
                        {criterionLabel(criterion).name}
                      </span>
                      {criterionLabel(criterion).description && (
                        <span className="mt-0.5 block text-sm font-medium leading-snug text-gray-800">
                          {criterionLabel(criterion).description}
                        </span>
                      )}
                      {!compact && RECOGNITION_CRITERIA_DESCRIPTIONS[criterion] && (
                        <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">{term.reasonDescription(criterion, RECOGNITION_CRITERIA_DESCRIPTIONS[criterion])}</span>
                      )}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>

          {form.criteria.includes(OTHER_REASON) && (
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Other — what was it?
                {form.type === 'star-of-day' && <span className="ml-1.5 text-[#b3261e]" aria-hidden="true">*</span>}
              </span>
              <input
                type="text"
                maxLength={120}
                required={form.type === 'star-of-day'}
                value={form.otherReason}
                onChange={event => onFieldChange(surface, 'otherReason', event.target.value)}
                placeholder="Covered a double shift"
                className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-300 focus:border-[#c28b24] focus:outline-none focus:ring-2 focus:ring-amber-100"
              />
              {form.type === 'star-of-day' && (
                <span className="mt-1 block text-[11px] font-semibold text-[#9a651b]">
                  This prints on the card with the star message.
                </span>
              )}
            </label>
          )}

          {form.type === 'star-shout-out' && (
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Submitted by</span>
              <input
                type="text"
                maxLength={200}
                value={form.sourceName}
                onChange={event => onFieldChange(surface, 'sourceName', event.target.value)}
                placeholder="Student, teacher, staff member, or another manager"
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

          </>}

          {canEdit && !awaitingType ? (
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
                      : isAceBuck && chosenIds.length > 1
                        ? `Award ${chosenIds.length} ACE Coach Bucks`
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
          ) : null}
          {/* Separate from the submit block: waiting for a type is not the
              same as being read-only, and saying so would be a lie. */}
          {!canEdit && (
            <p className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800">Recognition entry is read-only for this login.</p>
          )}
        </fieldset>
      </form>
    </section>
  )
}

// Liz, 2026-10-19: one window for the two things you read rather than do.
// The feed and the team answer different questions about the same people,
// and neither needs to be on screen while you are looking at the other.
//
// The second tab was the leaderboard until 2026-11-11, when Jon took the
// boards out: ranking people by star count had made recognition a contest.
// It is now the whole team in name order — see TeamCoverage.
//
// The tab lives in the page, not here, because the command centre links
// straight to the feed and that link has to open the tab it points at.
function BoardPanel({ tab, onTabChange, feed, team, teamLabel }) {
  const tabs = [
    { id: 'feed', label: 'The feed' },
    { id: 'team', label: teamLabel },
  ]
  const active = tabs.some(item => item.id === tab) ? tab : 'feed'

  return (
    <section id="recognition-history" className="scroll-mt-24 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap gap-1 border-b border-gray-200 bg-gray-50 px-3 pt-3 sm:px-4">
        {tabs.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => onTabChange(item.id)}
            aria-current={active === item.id ? 'true' : undefined}
            className={`rounded-t-lg px-4 py-2.5 text-xs font-black uppercase tracking-wide transition-colors ${
              active === item.id
                ? 'border border-b-white border-gray-200 bg-white text-[#9a651b]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="p-5 sm:p-6">{active === 'feed' ? feed : team}</div>
      {/* Outside the padding on purpose: the levels band runs to the edge of
          the panel the way it ran to the edge of its own card. */}
      {active === 'team' && <StarLevels />}
    </section>
  )
}

// Who has been recognized this month and who has not yet, for whatever the
// building view holds. Replaced the staff and manager leaderboards on
// 2026-11-11.
//
// Nobody is ranked. The people not yet recognized this month come first,
// because they are the ones a manager can do something about, and inside
// each group the order is by name. No star totals: each person gets their
// own distance to their next level, the one number that is about them
// rather than about them against somebody else.
//
// Across every building the list would be the whole district, so it opens
// as one line per building — how many of its team have been recognized —
// and a building expands to its people. Buildings stay in name order;
// sorting them by coverage would only make a league table of kitchens.
function TeamCoverage({ entries, locations, managerIds, monthLabel }) {
  const [openLocationId, setOpenLocationId] = useState(null)
  const recognized = entries.filter(entry => entry.recognizedThisMonth).length

  if (!entries.length) {
    return (
      <p className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
        Nobody is on the roster for this view.
      </p>
    )
  }

  if (!locations) {
    return (
      <div>
        <p className="text-xs text-gray-500">
          {recognized} of {entries.length} recognized in {monthLabel} so far.
        </p>
        <TeamList entries={entries} managerIds={managerIds} />
      </div>
    )
  }

  const byLocation = new Map()
  for (const entry of entries) {
    const locationId = String(entry.employee?.location || '')
    if (!byLocation.has(locationId)) byLocation.set(locationId, [])
    byLocation.get(locationId).push(entry)
  }
  const buildings = locations
    .filter(location => byLocation.has(location.id))
    .sort((left, right) => left.name.localeCompare(right.name))

  return (
    <div>
      <p className="text-xs text-gray-500">
        {recognized} of {entries.length} across these buildings recognized in {monthLabel} so far.
        Open a building to see its team.
      </p>
      <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200">
        {buildings.map(location => {
          const team = byLocation.get(location.id)
          const done = team.filter(entry => entry.recognizedThisMonth).length
          const open = openLocationId === location.id
          return (
            <li key={location.id}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenLocationId(open ? null : location.id)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-amber-50/70"
              >
                <span className={`text-[10px] text-[#ad741e] transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true">▶</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">{location.name}</span>
                <span className="flex-none text-xs text-gray-500">{done} of {team.length} recognized</span>
              </button>
              {open && (
                <div className="border-t border-gray-100 bg-[#fffdf7] px-3 pb-3">
                  <TeamList entries={team} managerIds={managerIds} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function TeamList({ entries, managerIds }) {
  const waiting = entries.filter(entry => !entry.recognizedThisMonth)
  const recognized = entries.filter(entry => entry.recognizedThisMonth)
  return (
    <div>
      {waiting.length > 0 && <TeamGroup title="Not yet this month" entries={waiting} managerIds={managerIds} />}
      {recognized.length > 0 && <TeamGroup title="Recognized this month" entries={recognized} managerIds={managerIds} />}
    </div>
  )
}

function TeamGroup({ title, entries, managerIds }) {
  return (
    <div className="mt-4">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">{title} · {entries.length}</p>
      <ul className="mt-1 space-y-0.5">
        {entries.map(entry => (
          <li key={entry.employeeId}>
            <Link
              to={`/employee/${entry.employeeId}`}
              className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-amber-50"
            >
              <span
                className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs ${
                  entry.recognizedThisMonth
                    ? 'bg-amber-100 text-[#9a651b]'
                    : 'border border-dashed border-gray-300 text-gray-300'
                }`}
                aria-hidden="true"
              >
                {entry.recognizedThisMonth ? '★' : '☆'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-gray-900 group-hover:text-[#9a651b]">
                    {employeeName(entry.employee)}
                  </span>
                  {managerIds?.has(entry.employeeId) && (
                    <span className={`flex-none rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${gradeAccent(true).chip}`}>
                      {gradeAccent(true).label}
                    </span>
                  )}
                </span>
                <span className="block truncate text-[11px] text-gray-500">
                  {[
                    entry.recognizedThisMonth
                      ? ''
                      : entry.lastRecognized
                        ? `Last recognized ${formatDate(entry.lastRecognized)}`
                        : 'Not recognized yet this school year',
                    levelProgress(entry),
                  ].filter(Boolean).join(' · ')}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

// "2 more to Bronze Star", or the level reached and the next one. A
// person's own distance to their own next goal — never a total to set
// beside somebody else's. Used for Coach Bucks too, which have the same
// shape against the coach milestones.
function levelProgress(entry) {
  const reached = entry.level ? `${entry.level.symbol} ${entry.level.name}` : ''
  const next = entry.nextLevel ? `${entry.toNextLevel} more to ${entry.nextLevel.name}` : ''
  return [reached, next].filter(Boolean).join(' · ')
}

// Stars earned per building, month by month. Until 2026-11-11 this window
// had a second tab, "Who is giving stars", ranking buildings by how many
// they had handed out. It came out with the leaderboards: the number of
// stars given is exactly the number people had started competing on.
function StarActivity({ summary, months, schoolYearStart, records, employeeMap }) {
  if (!summary.length) return null
  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <BuildingStarCounts summary={summary} months={months} schoolYearStart={schoolYearStart} records={records} employeeMap={employeeMap} />
    </section>
  )
}

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

// The band at the foot of the team list: what the levels are, so "2 more to
// Bronze Star" has something to point at. Read from Settings rather than the
// shipped defaults, so a milestone Liz renames reads the same here as in the
// line above it.
function StarLevels() {
  return (
    <div className="bg-[#15120e] text-white">
      <div className="border-b border-amber-200/15 px-5 py-3">
        <h3 className="all-star-display text-lg uppercase">Recognition Levels</h3>
      </div>
      <div className="divide-y divide-white/10">
        {starLevels().map(level => (
          <div key={level.id} className="flex items-center gap-3 px-5 py-2.5">
            <span className="text-lg" aria-hidden="true">{level.symbol}</span>
            <span className="flex-1 text-sm font-bold">{level.name}</span>
            <span className="text-xs font-semibold text-amber-100/70">{level.minimum} recognitions</span>
          </div>
        ))}
      </div>
    </div>
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
  managerEntriesHeld = 0,
  monthlyWinner,
  monthlyWinnerEmployee,
  drawingAvailability,
  onDraw,
  canRedraw = false,
  redrawEntries = [],
  setAside = [],
  savingWinner = false,
  onRedraw,
  onEditWinner,
  onRemoveWinner,
  winnerCandidates = () => [],
}) {
  const uniqueCandidates = new Set(entries.map(entry => entry.employeeId)).size
  const redrawCandidates = new Set(redrawEntries.map(entry => entry.employeeId)).size
  // Which of redraw, edit or remove is open, keyed to the winner rather than
  // a plain flag, so it closes by itself once the change lands or the
  // building or month changes.
  const [panel, setPanel] = useState(null)
  const open = monthlyWinner && panel?.id === monthlyWinner.id ? panel : null
  const winnerName = employeeName(monthlyWinnerEmployee) || monthlyWinner?.employeeId
  const openPanel = mode => setPanel({
    id: monthlyWinner.id,
    mode,
    monthKey: monthlyWinner.monthKey,
    locationId: monthlyWinner.locationId,
    employeeId: String(monthlyWinner.employeeId),
  })
  const candidates = open?.mode === 'edit' ? winnerCandidates(open.locationId, open.monthKey) : []
  // The winner as recorded stays choosable even if they are no longer on
  // that building's active roster, so opening the editor never silently
  // changes who it names.
  const editOptions = open?.mode === 'edit' && open.employeeId && !candidates.some(person => person.id === open.employeeId)
    ? [{ id: open.employeeId, name: open.employeeId === String(monthlyWinner.employeeId) ? winnerName : open.employeeId, entries: 0 }, ...candidates]
    : candidates
  const personChanged = open?.mode === 'edit' && open.employeeId !== String(monthlyWinner.employeeId)
  return (
    <section className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-amber-100 text-xl" aria-hidden="true">🏅</span>
        <div>
          {/* "Building" because the district has an award of its own each
              month — Warren Food Services Employee of the Month, one person
              for the whole district — and the two were easy to mix up. */}
          <h2 className="all-star-display text-xl uppercase text-gray-950">Building All-Star of the Month</h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">One per building, drawn at random. Each Star of the Day equals one entry, so more daily stars mean a greater chance of selection.</p>
          {managerEntriesHeld > 0 && (
            <p className={`mt-2 rounded-lg border px-3 py-2 text-xs font-semibold ${gradeAccent(true).note}`}>
              {managerEntriesHeld} star{managerEntriesHeld === 1 ? '' : 's'} earned by Worker Leads, Managers or the Director
              {' '}are not in this drawing — they are recognized in the manager pool instead.
            </p>
          )}
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
        <>
          <div className="mt-4 rounded-xl border border-amber-300 bg-gradient-to-br from-amber-50 to-[#fff4c4] p-4 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Recorded winner</p>
            <p className="mt-2 text-lg font-black text-gray-950">★ {winnerName}</p>
            <p className="mt-1 text-xs text-gray-500">{formatMonth(drawingMonth)} - {LOCATION_MAP[drawingScope]?.name || drawingScope}</p>
            {/* Only an administrator's session ever holds this list — the
                server strips it for everyone else — and it stays folded so
                the drawing can be run on a shared screen. */}
            {setAside.length > 0 && (
              <details className="mt-3 rounded-lg border border-amber-200 bg-white/70 px-3 py-2 text-left">
                <summary className="cursor-pointer text-[11px] font-semibold text-amber-800">
                  Redrawn · {setAside.length} name{setAside.length === 1 ? '' : 's'} set aside · district admins only
                </summary>
                <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-gray-600">
                  {setAside.map((entry, index) => (
                    <li key={`${entry.employeeId}-${index}`}>
                      {entry.name} — set aside {formatMoment(entry.setAsideAt)}{entry.setAsideBy ? ` by ${entry.setAsideBy}` : ''}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          {canRedraw && !open && (
            <div className="mt-2 grid grid-cols-3 gap-1">
              {[['edit', 'Edit…'], ['redraw', 'Redraw…'], ['remove', 'Remove…']].map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => openPanel(mode)}
                  className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {canRedraw && open?.mode === 'redraw' && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
              <p className="text-xs font-bold text-gray-900">Set aside {winnerName} and draw again?</p>
              <p className="mt-1 text-[11px] leading-relaxed text-gray-600">
                {redrawEntries.length > 0
                  ? `${winnerName} is left out of this redraw. The new winner is drawn from the other ${redrawEntries.length} entr${redrawEntries.length === 1 ? 'y' : 'ies'} (${redrawCandidates} ${redrawCandidates === 1 ? 'person' : 'people'}). Building managers and the public board will only see the new winner.`
                  : 'Nobody else has a Star of the Day entry this month, so there is no one to redraw.'}
              </p>
              <WinnerPanelButtons
                confirmLabel={savingWinner ? 'Redrawing…' : 'Set aside and redraw'}
                onConfirm={onRedraw}
                confirmDisabled={savingWinner || redrawEntries.length === 0}
                onCancel={() => setPanel(null)}
                busy={savingWinner}
              />
            </div>
          )}
          {canRedraw && open?.mode === 'edit' && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
              <p className="text-xs font-bold text-gray-900">Edit the recorded winner</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Month</span>
                  <input
                    type="month"
                    value={open.monthKey}
                    onChange={event => setPanel({ ...open, monthKey: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Building</span>
                  <select
                    value={open.locationId}
                    onChange={event => {
                      const locationId = event.target.value
                      // A person belongs to one building, so changing it
                      // clears the choice unless they work there too.
                      const stillThere = winnerCandidates(locationId, open.monthKey).some(person => person.id === open.employeeId)
                      setPanel({ ...open, locationId, employeeId: stillThere ? open.employeeId : '' })
                    }}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs"
                  >
                    {availableLocations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
                  </select>
                </label>
              </div>
              <label className="mt-2 block">
                <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Winner</span>
                <select
                  value={open.employeeId}
                  onChange={event => setPanel({ ...open, employeeId: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs"
                >
                  <option value="">Choose who won</option>
                  {editOptions.map(person => (
                    <option key={person.id} value={person.id}>
                      {person.name}{person.entries ? ` — ${person.entries} entr${person.entries === 1 ? 'y' : 'ies'}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              {personChanged && open.employeeId && (
                <p className="mt-2 text-[11px] leading-relaxed text-gray-600">
                  Chosen by hand rather than drawn, so the award will read &ldquo;Recorded by the district&rdquo; instead of the drawing&apos;s entry count.
                </p>
              )}
              <WinnerPanelButtons
                confirmLabel={savingWinner ? 'Saving…' : 'Save changes'}
                onConfirm={() => onEditWinner({ employeeId: open.employeeId, locationId: open.locationId, monthKey: open.monthKey })}
                confirmDisabled={savingWinner || !open.employeeId || !open.monthKey || !open.locationId}
                onCancel={() => setPanel(null)}
                busy={savingWinner}
              />
            </div>
          )}
          {canRedraw && open?.mode === 'remove' && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-3">
              <p className="text-xs font-bold text-gray-900">
                Remove {winnerName} as {formatMonth(drawingMonth)} winner for {LOCATION_MAP[drawingScope]?.name || drawingScope}?
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-gray-600">
                The month goes back to having no winner, and can be drawn again from everyone&apos;s entries.
              </p>
              <WinnerPanelButtons
                confirmLabel={savingWinner ? 'Removing…' : 'Remove winner'}
                onConfirm={onRemoveWinner}
                confirmDisabled={savingWinner}
                onCancel={() => setPanel(null)}
                busy={savingWinner}
              />
            </div>
          )}
        </>
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

function EmployeeOfMonthPanel({
  monthKey,
  setMonthKey,
  awards,
  employeeMap,
  people,
  canEdit,
  saving,
  onEdit,
  onRemove,
}) {
  // Keyed to the award, as in MonthlyDrawing, so it closes by itself once
  // the change lands or the month changes.
  const [panel, setPanel] = useState(null)
  const open = awards.find(award => award.id === panel?.id) ? panel : null
  const reasons = RECOGNITION_CRITERIA[EMPLOYEE_OF_MONTH_TYPE] || []
  // The whole district, because this is the district's award. The building
  // goes beside each name, since across sixteen buildings it is the only
  // thing that tells two people with one surname apart.
  const choices = [...people].sort((left, right) => employeeListName(left).localeCompare(employeeListName(right)))
  const openPanel = (award, mode) => setPanel({
    id: award.id,
    mode,
    employeeId: String(award.employeeId),
    date: award.date,
    criteria: Array.isArray(award.criteria) ? award.criteria : [],
    note: award.note || '',
  })

  return (
    <section className="rounded-2xl border border-[#d7b44b] bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[#fdf3d8] text-xl" aria-hidden="true">🏆</span>
        <div>
          <h2 className="all-star-display text-xl uppercase text-gray-950">Warren Food Services Employee of the Month</h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">One for the whole district each month, chosen by the district — not drawn, and not one per building.</p>
        </div>
      </div>

      <label className="mt-4 block">
        <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Month</span>
        <input
          type="month"
          value={monthKey}
          onChange={event => setMonthKey(event.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs"
        />
      </label>

      {awards.length === 0 && (
        <p className="mt-4 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-xs text-gray-500">
          No Employee of the Month recorded for {formatMonth(monthKey)}.
          {canEdit && ' Record one from Bonus recognition above.'}
        </p>
      )}
      {/* Only possible for a month recorded before the one-per-month rule.
          Said plainly, because the fix is the administrator's to make. */}
      {awards.length > 1 && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
          {formatMonth(monthKey)} has {awards.length} recorded. There should be one — remove the extra.
        </p>
      )}

      {awards.map(award => {
        const person = employeeMap.get(String(award.employeeId))
        const name = employeeName(person) || 'Former employee'
        const editing = open?.id === award.id ? open : null
        return (
          <div key={award.id} className="mt-4">
            <div className="rounded-xl border border-[#d7b44b] bg-gradient-to-br from-[#fdf3d8] to-white p-4 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7a4b12]">Employee of the Month</p>
              <p className="mt-2 text-lg font-black text-gray-950">🏆 {name}</p>
              <p className="mt-1 text-xs text-gray-500">
                {LOCATION_MAP[award.locationId]?.name || award.locationId} · {formatDate(award.date)}
              </p>
              {award.criteria?.length > 0 && (
                <p className="mt-2 text-[11px] font-semibold text-[#7a4b12]">{award.criteria.join(' · ')}</p>
              )}
              {award.note && <p className="mt-1 text-xs italic text-gray-600">&ldquo;{award.note}&rdquo;</p>}
            </div>

            {canEdit && !editing && (
              <div className="mt-2 grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => openPanel(award, 'edit')}
                  className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                >
                  Edit…
                </button>
                <button
                  type="button"
                  onClick={() => openPanel(award, 'remove')}
                  className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                >
                  Remove…
                </button>
              </div>
            )}

            {canEdit && editing?.mode === 'edit' && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
                <p className="text-xs font-bold text-gray-900">Edit Employee of the Month</p>
                <label className="mt-2 block">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Employee</span>
                  <select
                    value={editing.employeeId}
                    onChange={event => setPanel({ ...editing, employeeId: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs"
                  >
                    {!choices.some(employee => employeeKey(employee) === editing.employeeId) && (
                      <option value={editing.employeeId}>{name}</option>
                    )}
                    {choices.map(employee => (
                      <option key={employeeKey(employee)} value={employeeKey(employee)}>
                        {employeeListName(employee)}{employee.location ? ` — ${LOCATION_MAP[employee.location]?.name || employee.location}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-2 block">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Date</span>
                  <input
                    type="date"
                    value={editing.date}
                    max={localDateKey()}
                    onChange={event => setPanel({ ...editing, date: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs"
                  />
                  <span className="mt-1 block text-[11px] text-gray-500">The month of this date is the month they are Employee of.</span>
                </label>
                <fieldset className="mt-2">
                  <legend className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Qualified through</legend>
                  <div className="mt-1 space-y-1">
                    {reasons.map(reason => (
                      <label key={reason} className="flex items-center gap-2 text-xs text-gray-700">
                        <input
                          type="checkbox"
                          checked={editing.criteria.includes(reason)}
                          onChange={() => setPanel({
                            ...editing,
                            criteria: editing.criteria.includes(reason)
                              ? editing.criteria.filter(value => value !== reason)
                              : [...editing.criteria, reason],
                          })}
                          className="rounded border-gray-300 text-[#c28b24] focus:ring-amber-300"
                        />
                        {reason}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="mt-2 block">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Why they were selected</span>
                  <textarea
                    rows={3}
                    maxLength={1000}
                    value={editing.note}
                    onChange={event => setPanel({ ...editing, note: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs"
                  />
                </label>
                <WinnerPanelButtons
                  confirmLabel={saving ? 'Saving…' : 'Save changes'}
                  onConfirm={() => onEdit(award, editing)}
                  confirmDisabled={saving || !editing.employeeId || !editing.date || editing.criteria.length === 0}
                  onCancel={() => setPanel(null)}
                  busy={saving}
                />
              </div>
            )}

            {canEdit && editing?.mode === 'remove' && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-3">
                <p className="text-xs font-bold text-gray-900">Remove {name} as Employee of the Month for {formatMonth(String(award.date).slice(0, 7))}?</p>
                <p className="mt-1 text-[11px] leading-relaxed text-gray-600">
                  The month goes back to having no Employee of the Month, and one can be recorded again.
                </p>
                <WinnerPanelButtons
                  confirmLabel={saving ? 'Removing…' : 'Remove'}
                  onConfirm={() => onRemove(award)}
                  confirmDisabled={saving}
                  onCancel={() => setPanel(null)}
                  busy={saving}
                />
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}

function WinnerPanelButtons({ confirmLabel, onConfirm, confirmDisabled, onCancel, busy }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={onConfirm}
        disabled={confirmDisabled}
        className="rounded-lg bg-[#211b12] px-3 py-2 text-xs font-black uppercase tracking-wide text-[#ffd75c] hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
      >
        Cancel
      </button>
    </div>
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
                  <p className="text-xs font-black text-gray-900">{employeeName(employee) || 'Former employee'}</p>
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

// The Leadership Track, in one place: what it is, how to award one, and how
// far each manager is from their next milestone. Pulled out of the side
// panel on 2026-10-19 — it had been a card explaining a programme that could
// not be used, beside a bonus form that could award one without saying so.
//
// Green, so a third currency reads as neither the gold of the stars nor the
// blue of the managers.
//
// District-only while the programme settles. The server refuses an ACE Buck
// from a school session regardless, so this is about not showing a manager a
// section they cannot act on.
function AceBucksSection({
  coaches,
  schoolYearStart,
  coachLevels,
  form,
  employees,
  peerManagers,
  managerIds,
  // Without this the award form offers nobody: the eligibility test falls
  // back to `undefined?.has(...) === true`, which is false for everyone, so
  // the "Which leader" list renders empty. Reported by Liz, 2026-10-20 —
  // the page had always passed it and this component had always dropped it.
  aceEligibleIds,
  canEdit,
  isSubmitting,
  confirmation,
  onFieldChange,
  onToggleCriterion,
  onSubmit,
  onRetry,
}) {
  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-emerald-300 bg-white shadow-sm">
      <div className="border-b border-emerald-200 bg-gradient-to-r from-[#0f3d2e] to-[#15583f] px-5 py-5 text-white sm:px-6">
        <div className="flex items-start gap-3">
          <span
            className="flex h-12 w-12 flex-none items-center justify-center rounded-xl border border-emerald-300/50 bg-emerald-300/15 text-2xl text-emerald-200"
            aria-hidden="true"
          >◆</span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Manager program</p>
            <h2 className="all-star-display mt-1 text-2xl uppercase">ACE Coach Bucks</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-emerald-100/80">
              The leadership side of the All-Star program. Kitchen managers already earn Stars for what
              they do; Coach Bucks are for how they lead, awarded by the district office to the fifteen
              people running kitchens.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-2">
        <div>
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#15583f]">Award a Coach Buck</h3>
          <div className="mt-3">
            <RecognitionEntryForm
              surface="ace"
              form={form}
              compact
              title="ACE Coach Buck"
              subtitle="District recognition for a kitchen manager."
              employees={employees}
              peerManagers={peerManagers}
              managerIds={managerIds}
              aceEligibleIds={aceEligibleIds}
              canEdit={canEdit}
              isSubmitting={isSubmitting}
              confirmation={confirmation}
              onFieldChange={onFieldChange}
              onToggleCriterion={onToggleCriterion}
              onSubmit={onSubmit}
              onRetry={onRetry}
            />
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#15583f]">
              Coach progress
            </h3>
            <span className="text-[11px] font-semibold text-gray-500">{schoolYearStart}–{schoolYearStart + 1}</span>
          </div>
          {/* Standings until 2026-11-11: ranked by Bucks, numbered, top ten.
              Now every eligible manager in name order with their own way to
              go, the same rule as the team list above. */}
          <p className="mt-1 text-[11px] text-gray-500">Every kitchen manager, in name order. Nobody is ranked.</p>

          {coaches.length === 0 ? (
            <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-6 text-center text-sm text-emerald-900">
              No kitchen managers are on the roster.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-emerald-100 rounded-xl border border-emerald-200">
              {coaches.map(entry => (
                <li key={employeeKey(entry.employee)}>
                  {/* Each row opens the manager's card. Liz, 2026-10-26. */}
                  <Link
                    to={`/employee/${employeeKey(entry.employee)}`}
                    className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-emerald-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-gray-900 group-hover:text-[#15583f]">
                        {employeeName(entry.employee)}
                      </span>
                      <span className="block text-[11px] text-gray-500">
                        {[
                          LOCATION_MAP[entry.employee.location]?.name || entry.employee.location,
                          levelProgress(entry),
                        ].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#15583f]">Coach milestones</p>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {coachLevels.map(level => (
                <li key={level.id} className="text-[11px] text-emerald-900">
                  <span aria-hidden="true">{level.symbol}</span> {level.name}
                  <span className="text-emerald-700"> · {level.minimum}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

function RecentRecognition({ records, employeeMap, managerIds, type, onTypeChange, onPrintSheet }) {
  const term = useProgramTerms()
  const [visibleCount, setVisibleCount] = useState(10)
  const filtered = records.filter(record => type === 'all' || record.type === type)
  const recent = filtered.slice(0, visibleCount)
  // Counts the whole filtered set, not just what is on screen: the sheet
  // prints everything listed, so the button must not promise fewer.
  //
  // Counts CARDS rather than stars, because since 2026-10-27 a group award
  // is several stars on one card. Counting the records made the button
  // offer "3 star cards" for a sheet that prints one.
  const printableCount = toStarCardEntries(
    filtered.filter(record => record.type === 'star-of-day'),
    () => '',
  ).length
  return (
    <div>
      {/* No heading of its own: the tab above says what this is, and a second
          title inside the panel was the kind of box Liz is trying to lose. */}
      <p className="text-xs text-gray-500">Newest first, for the building view selected above.</p>

      {/* Chips rather than a select: on a feed the filter is something you
          flick between, and a labelled dropdown cost a line of its own. */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {[{ id: 'all', label: 'Everything' }, ...RECOGNITION_TYPES.map(item => ({ id: item.id, label: term.recognitionLabel(item.id, item.shortLabel || item.label) }))].map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => onTypeChange(item.id)}
            aria-pressed={type === item.id}
            className={`rounded-full border px-3 py-1 text-[11px] font-bold transition-colors ${
              type === item.id
                ? 'border-[#c28b24] bg-[#fdf7e8] text-[#7a4b12]'
                : 'border-gray-200 text-gray-500 hover:border-amber-200 hover:text-gray-700'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-xs text-gray-500">Showing {recent.length} of {filtered.length} records</p>
        {printableCount > 0 && (
          <button
            type="button"
            onClick={() => onPrintSheet?.(filtered)}
            className="rounded-lg border border-[#d7b44b] bg-[#fdf7e8] px-3 py-1.5 text-xs font-bold text-[#7a4b12] hover:bg-[#f7ecd2] print:hidden"
          >
            Print {printableCount} star card{printableCount === 1 ? '' : 's'} · six per page
          </button>
        )}
      </div>
      {recent.length ? (
        <div className="mt-4 divide-y divide-gray-100">
          {recent.map(record => {
            const employee = employeeMap.get(String(record.employeeId))
            // A cross-building shout-out arrives with the recipient's name
            // and nothing else — no roster entry, so no card to open. The
            // name is shown plainly rather than as a link that would land
            // on "unavailable for this login".
            const name = employeeName(employee) || record.recipientName || 'Former employee'
            const type = RECOGNITION_TYPE_MAP[record.type]
            const accent = recognitionAccent(record.type)
            return (
              <div key={record.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 text-lg ${accent.mark}`} aria-hidden="true">{accent.glyph}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="flex flex-wrap items-center gap-1.5">
                          {employee ? (
                            <Link to={`/employee/${record.employeeId}`} className="text-sm font-bold text-gray-900 hover:text-[#9a651b]">
                              {name}
                            </Link>
                          ) : (
                            <span className="text-sm font-bold text-gray-900">{name}</span>
                          )}
                          {managerIds?.has(String(record.employeeId)) && (
                            <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${gradeAccent(true).chip}`}>
                              {gradeAccent(true).label}
                            </span>
                          )}
                        </span>
                        <span className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${accent.chip}`}>
                          {term.recognitionLabel(record.type, type?.label || record.type)}
                          {!accent.earns && <span className="font-medium opacity-70">· no star</span>}
                        </span>
                      </div>
                      <span className="flex-none text-[11px] text-gray-400">{formatDate(record.date)}</span>
                    </div>
                    {record.criteria?.length > 0 && <p className="mt-1.5 text-xs text-gray-500">{record.criteria.map(value => criterionLabel(value).name).join(' · ')}</p>}
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
        <p className="mt-4 rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">No recognitions match this building and recognition type.</p>
      )}
      {recent.length < filtered.length && <button type="button" onClick={() => setVisibleCount(count => count + 10)} className="mt-4 rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-50">Show more recognition</button>}
    </div>
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

// Stars earned per building, month by month, with the school-year total.
// Counts Star of the Day only, matching every other figure on this page.
//
// Buildings in name order and people in name order, with no "×3" beside
// anybody. Since 2026-11-11 nothing on this page sorts by how many: the
// busiest building first was a league table of kitchens, and a count beside
// each name was the leaderboard again, one month at a time.
function BuildingStarCounts({ summary: unsorted, months, schoolYearStart, records, employeeMap }) {
  // Clicking a building answers the question the counts prompt: not how
  // many, but who.
  const [openLocationId, setOpenLocationId] = useState(null)
  const breakdown = useMemo(
    () => (openLocationId ? buildingMonthlyRecipients(records, schoolYearStart, openLocationId) : [])
      .map(month => ({
        ...month,
        recipients: [...month.recipients].sort((left, right) => (
          recognitionName(employeeMap, left.employeeId).localeCompare(recognitionName(employeeMap, right.employeeId))
        )),
      })),
    [openLocationId, records, schoolYearStart, employeeMap]
  )
  if (!unsorted.length) return null
  const buildingName = locationId => LOCATION_MAP[locationId]?.name || locationId
  const summary = [...unsorted].sort((left, right) => buildingName(left.locationId).localeCompare(buildingName(right.locationId)))
  const districtTotal = summary.reduce((total, entry) => total + entry.total, 0)

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="all-star-display text-xl uppercase text-gray-950">Stars by month</h2>
          <p className="mt-1 text-sm text-gray-500">
            Star of the Day only, counted for the building the person works in. Manager stars count here;
            they do not go into the building&apos;s monthly drawing.
          </p>
        </div>
        <span className="text-xs font-semibold text-gray-400">July {schoolYearStart} - June {schoolYearStart + 1}</span>
      </div>

      {/* Wide on purpose — the table scrolls rather than the page. */}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-2 pr-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">Building</th>
              {months.map(month => (
                <th key={month} className="px-2 py-2 text-center text-xs font-bold uppercase tracking-wide text-gray-500">
                  {formatMonth(month).slice(0, 3)}
                </th>
              ))}
              <th className="pl-3 py-2 text-right text-xs font-bold uppercase tracking-wide text-[#9a651b]">Year</th>
            </tr>
          </thead>
          <tbody>
            {summary.map(entry => {
              const open = openLocationId === entry.locationId
              const name = buildingName(entry.locationId)
              return (
                <Fragment key={entry.locationId}>
                  <tr
                    className={`border-b border-gray-100 last:border-0 ${
                      entry.total ? 'cursor-pointer hover:bg-amber-50/70' : ''
                    } ${open ? 'bg-amber-50' : ''}`}
                    onClick={() => entry.total && setOpenLocationId(open ? null : entry.locationId)}
                  >
                    <td className="py-2 pr-3 font-semibold text-gray-800">
                      {entry.total ? (
                        <button
                          type="button"
                          aria-expanded={open}
                          className="flex items-center gap-1.5 text-left hover:text-[#9a651b]"
                        >
                          <span className={`text-[10px] text-[#ad741e] transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true">▶</span>
                          {name}
                        </button>
                      ) : name}
                    </td>
                    {months.map(month => {
                      const count = entry.months[month] || 0
                      return (
                        <td
                          key={month}
                          className={`px-2 py-2 text-center tabular-nums ${count ? 'text-gray-700' : 'text-gray-300'}`}
                        >
                          {count || '—'}
                        </td>
                      )
                    })}
                    <td className={`pl-3 py-2 text-right font-black tabular-nums ${
                      entry.total ? 'text-[#ad741e]' : 'text-gray-300'
                    }`}>
                      {entry.total}
                    </td>
                  </tr>

                  {open && (
                    <tr className="border-b border-gray-100 bg-[#fffaf0]">
                      <td colSpan={months.length + 2} className="px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#9a651b]">
                          {name} · who earned them
                        </p>
                        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {breakdown.map(month => (
                            <div key={month.monthKey} className="rounded-lg border border-amber-200 bg-white p-2.5">
                              <p className="flex items-baseline justify-between gap-2">
                                <span className="text-xs font-bold text-gray-800">{formatMonth(month.monthKey)}</span>
                                <span className="text-xs font-black text-[#ad741e]">{month.total}</span>
                              </p>
                              <ul className="mt-1.5 space-y-0.5">
                                {month.recipients.map(person => (
                                  <li key={person.employeeId} className="text-xs">
                                    <Link
                                      to={`/employee/${person.employeeId}`}
                                      className="block truncate text-gray-700 hover:text-[#9a651b] hover:underline"
                                    >
                                      {recognitionName(employeeMap, person.employeeId)}
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200">
              <td className="py-2 pr-3 text-xs font-bold uppercase tracking-wide text-gray-500">All buildings</td>
              {months.map(month => (
                <td key={month} className="px-2 py-2 text-center text-xs font-semibold tabular-nums text-gray-500">
                  {summary.reduce((total, entry) => total + (entry.months[month] || 0), 0) || '—'}
                </td>
              ))}
              <td className="pl-3 py-2 text-right text-sm font-black tabular-nums text-[#ad741e]">{districtTotal}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {summary.some(entry => entry.total === 0) && (
        <p className="mt-3 text-xs text-gray-500">
          A building showing no stars has not recognized anyone this school year.
        </p>
      )}
    </div>
  )
}

// The card as it will actually print, shown before anything is recorded.
// Built by the same function the printer uses, so what is approved here and
// what comes out of the printer cannot drift apart.
function StarCardPreview({ preview, submitting, onConfirm, onBack }) {
  if (!preview) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="star-preview-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[#d7b44b] bg-white shadow-2xl">
        <div className="border-b border-amber-100 bg-[#fffaf0] px-5 py-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#9a651b]">Check before recording</p>
          <h2 id="star-preview-title" className="all-star-display mt-0.5 text-xl uppercase text-gray-950">
            {preview.employeeName}
          </h2>
        </div>

        <div className="flex justify-center bg-gray-100 px-4 py-4">
          <iframe
            title="Star of the Day card preview"
            className="h-[336px] w-[384px] max-w-full rounded-md border border-gray-300 bg-white shadow-sm"
            srcDoc={starCardPreviewHtml(preview.card)}
          />
        </div>

        <div className="flex flex-col gap-2 border-t border-gray-100 px-5 py-4 sm:flex-row-reverse">
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 rounded-lg bg-[#ad741e] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#8a5a12] disabled:opacity-60"
          >
            {submitting ? 'Recording…' : 'Looks right — record it'}
          </button>
          <button
            type="button"
            onClick={onBack}
            disabled={submitting}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            Go back and edit
          </button>
        </div>
      </div>
    </div>
  )
}
