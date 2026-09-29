import { writeSharedStorage } from './sharedStore.js'

export const RECOGNITION_STORAGE_KEY = 'all-star-recognition-v1'

export const STAR_LEVELS = [
  { id: 'bronze', name: 'Bronze Star', minimum: 5, symbol: '🥉' },
  { id: 'silver', name: 'Silver Star', minimum: 10, symbol: '🥈' },
  { id: 'gold', name: 'Gold Star', minimum: 20, symbol: '🥇' },
  { id: 'platinum', name: 'Platinum Star', minimum: 30, symbol: '🏆' },
  { id: 'superstar', name: 'Superstar', minimum: 50, symbol: '⭐' },
]

export const RECOGNITION_TYPES = [
  {
    id: 'star-of-day',
    label: 'Star of the Day',
    shortLabel: 'Daily Star',
    description: 'Daily recognition for an extra-sparkle performance.',
    earnsStar: true,
  },
  {
    id: 'shooting-star',
    label: 'Shooting Star Nomination',
    shortLabel: 'Shooting Star nomination',
    description: 'Nominate someone for quarterly review. A nomination does not add an earned star or drawing entry.',
    earnsStar: false,
    actionLabel: 'Submit Shooting Star nomination',
  },
  {
    id: 'star-shout-out',
    label: 'Warren Star Shout-Out',
    shortLabel: 'Shout-Out',
    description: 'A special recognition received from a student, teacher, or staff member.',
    earnsStar: false,
    actionLabel: 'Record Warren Star Shout-Out',
  },
  {
    id: 'warren-employee-month',
    label: 'Warren Food Services Employee of the Month',
    shortLabel: 'Warren EOM',
    description: 'Township-wide recognition for a qualifying top performer.',
    earnsStar: false,
    actionLabel: 'Record Employee of the Month',
  },
  {
    id: 'all-star-of-month',
    label: 'All-Star of the Month',
    shortLabel: 'Monthly All-Star',
    description: 'Building winner drawn from that month\'s daily recognition entries.',
    earnsStar: false,
  },
]

export const RECOGNITION_TYPE_MAP = Object.fromEntries(
  RECOGNITION_TYPES.map(type => [type.id, type])
)

export const ANNUAL_AWARD_CATEGORIES = [
  { name: 'Teamwork All-Star', description: 'Supports coworkers and creates a positive work environment.' },
  { name: 'Service All-Star', description: 'Provides exceptional customer service to students and staff.' },
  { name: 'Culinary All-Star', description: 'Demonstrates excellence in food preparation and meal presentation.' },
  { name: 'Safety All-Star', description: 'Consistently follows food safety and sanitation procedures.' },
  { name: 'Reliability All-Star', description: 'Demonstrates outstanding attendance and dependability.' },
  { name: 'Positivity All-Star', description: 'Brings a positive attitude and helps create a welcoming workplace.' },
]

export const ALL_STAR_REASON_OPTIONS = [
  'Teamwork',
  'Service',
  'Safety',
  'Culinary',
  'Reliability',
  'Positivity',
  'Other',
]

export const RECOGNITION_CRITERIA_DESCRIPTIONS = {
  Teamwork: 'Supports coworkers and creates a positive work environment.',
  Service: 'Provides exceptional customer service to students and staff.',
  Safety: 'Consistently follows food safety and sanitation procedures.',
  Culinary: 'Demonstrates excellence in food preparation and meal presentation.',
  Reliability: 'Demonstrates outstanding attendance and dependability.',
  Positivity: 'Brings a positive attitude and helps create a welcoming workplace.',
  Other: 'Choose this when none of the listed reasons fit, then explain it in the message below.',
}

export const RECOGNITION_CRITERIA = {
  'star-of-day': ALL_STAR_REASON_OPTIONS,
  'shooting-star': [
    'Improving attendance or perfect attendance',
    'Going above and beyond to help coworkers',
    'Mentoring a new team member and creating positive experiences',
    'Taking initiative to learn new skills or tasks',
    'Other',
  ],
  'star-shout-out': [
    'Showing patience or kindness when helping students',
    'Participating in school functions beyond regular duties',
    'Working with teachers and communicating effectively',
    'Creating a positive cafeteria environment for students',
    'Other',
  ],
  'warren-employee-month': [
    'Qualified through All-Star of the Month',
    'Qualified through a Shooting Star award',
    'Qualified through a Warren Star Shout-Out',
  ],
  'all-star-of-month': [],
}

function readRecognitionMap() {
  try {
    const value = JSON.parse(localStorage.getItem(RECOGNITION_STORAGE_KEY) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

function validDateKey(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) return false
  const date = new Date(`${dateKey}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === dateKey
}

export function getAllRecognitions() {
  return Object.values(readRecognitionMap())
    .filter(record => record && typeof record === 'object' && record.id)
    .sort((left, right) => {
      const dateOrder = String(right.date || '').localeCompare(String(left.date || ''))
      return dateOrder || String(right.createdAt || '').localeCompare(String(left.createdAt || ''))
    })
}

export function createRecognitionRecord(input, options = {}) {
  const employeeId = String(input.employeeId || '').trim()
  const locationId = String(input.locationId || '').trim()
  const type = String(input.type || '')
  const date = String(input.date || '')
  if (!employeeId || !locationId) throw new Error('Choose an employee with a building assignment.')
  if (!RECOGNITION_TYPE_MAP[type]) throw new Error('Choose a valid recognition type.')
  if (!validDateKey(date)) throw new Error('Choose a valid recognition date.')

  const allowedCriteria = new Set(RECOGNITION_CRITERIA[type] || [])
  const criteria = [...new Set(Array.isArray(input.criteria) ? input.criteria : [])]
    .map(value => String(value || '').trim())
    .filter(value => allowedCriteria.has(value))

  if (type !== 'all-star-of-month' && criteria.length === 0) {
    throw new Error('Choose at least one reason for the recognition.')
  }

  const note = String(input.note || '').trim().slice(0, 1000)
  // A Star of the Day has to say why the person shines. Without it managers can
  // click names onto the board with no reason attached, which is the whole point
  // of the award. The monthly draw writes its own note, so it is exempt.
  if (requiresStarMessage(type) && !note) {
    throw new Error('Add a star card message describing why they shine.')
  }

  const createdAt = options.createdAt || new Date().toISOString()
  const id = options.id || `recognition-${Date.now()}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`
  const monthKey = type === 'all-star-of-month'
    ? String(input.monthKey || date.slice(0, 7))
    : null

  return {
    id,
    employeeId,
    locationId,
    type,
    date,
    monthKey,
    criteria,
    note,
    sourceName: String(input.sourceName || '').trim().slice(0, 200),
    recognizedBy: String(input.recognizedBy || '').trim().slice(0, 200),
    // Which building submitted this, so the district can see where recognition
    // is (and is not) happening. The server overwrites this from the session, so
    // a client cannot claim to be another building. PINs themselves are never
    // stored — the signed-in building is what answers "which school".
    recognizedByLocationId: String(input.recognizedByLocationId || '').trim().slice(0, 100),
    createdAt,
  }
}

// Every award a manager writes by hand carries the message requirement: a name
// with no reason attached is the thing the program is trying to avoid, and each
// of these can now be given for "Other", which means nothing without the note.
// Liz, 2026-09-01: extended from Star of the Day to both nomination surfaces.
// The monthly draw is exempt — it writes its own note.
const MESSAGE_REQUIRED_TYPES = new Set(['star-of-day', 'shooting-star', 'star-shout-out'])

export function requiresStarMessage(type) {
  return MESSAGE_REQUIRED_TYPES.has(type)
}

export const DISTRICT_SUBMITTER_ID = 'district'

export function submitterLocationLabel(record, locationMap = {}) {
  const id = String(record?.recognizedByLocationId || '').trim()
  if (!id) return 'Not recorded'
  if (id === DISTRICT_SUBMITTER_ID) return 'District admin'
  return locationMap[id]?.name || id
}

// Who is handing out recognition, grouped by the building that submitted it.
export function getSubmissionCountsByLocation(records) {
  const counts = new Map()
  ;(records || []).forEach(record => {
    if (!recognitionEarnsStar(record)) return
    const id = String(record?.recognizedByLocationId || '').trim() || 'unknown'
    counts.set(id, (counts.get(id) || 0) + 1)
  })
  return [...counts.entries()]
    .map(([locationId, count]) => ({ locationId, count }))
    .sort((left, right) => right.count - left.count || left.locationId.localeCompare(right.locationId))
}

export function addRecognition(input, options = {}) {
  const record = createRecognitionRecord(input, options)
  const records = readRecognitionMap()
  records[record.id] = record
  writeSharedStorage(RECOGNITION_STORAGE_KEY, records)
  return record
}

export function schoolYearStartFor(dateValue = new Date()) {
  const date = dateValue instanceof Date
    ? dateValue
    : new Date(`${String(dateValue).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(date.valueOf())) throw new Error('A valid date is required.')
  return date.getMonth() >= 6 ? date.getFullYear() : date.getFullYear() - 1
}

export function isRecognitionInSchoolYear(record, startYear) {
  return String(record?.date || '') >= `${startYear}-07-01`
    && String(record?.date || '') <= `${startYear + 1}-06-30`
}

export function recognitionEarnsStar(record) {
  return RECOGNITION_TYPE_MAP[record?.type]?.earnsStar === true
}

export function getEmployeeStarCount(records, employeeId, startYear) {
  return records.filter(record =>
    String(record.employeeId) === String(employeeId)
    && isRecognitionInSchoolYear(record, startYear)
    && recognitionEarnsStar(record)
  ).length
}

export function getStarLevel(count) {
  return [...STAR_LEVELS].reverse().find(level => Number(count) >= level.minimum) || null
}

export function getNextStarLevel(count) {
  return STAR_LEVELS.find(level => Number(count) < level.minimum) || null
}

// excludedEmployeeIds carries the manager-grade roster once the split is
// switched on. Left optional so the building drawing behaves exactly as it
// always has until a caller passes it.
export function getMonthlyDrawingEntries(records, locationId, monthKey, excludedEmployeeIds = null) {
  return records.filter(record =>
    record.type === 'star-of-day'
    && record.locationId === locationId
    && String(record.date || '').startsWith(`${monthKey}-`)
    && !(excludedEmployeeIds && excludedEmployeeIds.has(String(record.employeeId)))
  )
}

export function drawMonthlyAllStar(records, locationId, monthKey, randomValue = Math.random(), excludedEmployeeIds = null) {
  const entries = getMonthlyDrawingEntries(records, locationId, monthKey, excludedEmployeeIds)
  if (!entries.length) return null
  const boundedRandom = Math.max(0, Math.min(Number(randomValue) || 0, 0.999999999))
  const winningEntry = entries[Math.floor(boundedRandom * entries.length)]
  return {
    employeeId: winningEntry.employeeId,
    entryCount: entries.filter(entry => entry.employeeId === winningEntry.employeeId).length,
    totalEntries: entries.length,
  }
}

export function existingMonthlyWinner(records, locationId, monthKey) {
  return records.find(record =>
    record.type === 'all-star-of-month'
    && record.locationId === locationId
    && record.monthKey === monthKey
  ) || null
}

// Liz asked for the school-year leaderboard condensed to a top ten. Ties that
// straddle the cut are kept: two people on the same star count are the same
// standing, and dropping one of them because of an alphabetical tiebreak reads
// as the board being wrong.
export function topLeaderboardEntries(entries, limit = 10) {
  const list = Array.isArray(entries) ? entries : []
  if (list.length <= limit || limit < 1) return list
  const cutoff = list[limit - 1]?.count
  let end = limit
  while (end < list.length && list[end]?.count === cutoff) end += 1
  return list.slice(0, end)
}

// Earned stars per building, by month and for the school year. Deliberately
// counts Star of the Day only, matching every other total on the page, so two
// figures can never disagree about how many stars exist.
export function buildingRecognitionSummary(records, startYear, locationIds = []) {
  const summary = new Map()
  const ensure = locationId => {
    if (!summary.has(locationId)) summary.set(locationId, { locationId, months: {}, total: 0 })
    return summary.get(locationId)
  }
  locationIds.forEach(ensure)

  for (const record of Array.isArray(records) ? records : []) {
    if (!recognitionEarnsStar(record)) continue
    if (!isRecognitionInSchoolYear(record, startYear)) continue
    const locationId = String(record.locationId || '')
    if (!locationId) continue
    const monthKey = String(record.date || '').slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(monthKey)) continue
    const entry = ensure(locationId)
    entry.months[monthKey] = (entry.months[monthKey] || 0) + 1
    entry.total += 1
  }

  return [...summary.values()].sort((left, right) => right.total - left.total
    || left.locationId.localeCompare(right.locationId))
}

// The months of a school year in order, July through June, so a table has a
// stable set of columns even in a month nobody was recognised.
export function schoolYearMonthKeys(startYear) {
  return Array.from({ length: 12 }, (_, index) => {
    const month = ((6 + index) % 12) + 1
    const year = month >= 7 ? startYear : startYear + 1
    return `${year}-${String(month).padStart(2, '0')}`
  })
}

// Recognition records turned into printable Star of the Day cards. Only the
// daily star prints: the physical board is a Star of the Day board, and a
// nomination is not an award yet.
export function toStarCardEntries(records, resolveName) {
  return (Array.isArray(records) ? records : [])
    .filter(record => record?.type === 'star-of-day')
    .map(record => ({
      name: resolveName(record.employeeId) || String(record.employeeId || ''),
      date: record.date,
      criteria: record.criteria || [],
      message: record.note || '',
      recognizedBy: record.recognizedBy || '',
    }))
}

// Liz asked for Shout-Outs and Shooting Stars to read differently from the
// daily star, because they are different things: only Star of the Day earns a
// star and a drawing entry. Kept here rather than in the page so the entry
// form, the history list and any later surface cannot drift apart.
//
// `earns` marks the two that actually add to someone's star count, so the
// distinction is visible at a glance and not just a colour difference.
export const RECOGNITION_ACCENTS = {
  'star-of-day': {
    glyph: '★',
    earns: true,
    text: 'text-[#a36d1d]',
    chip: 'border-amber-300 bg-amber-50 text-[#8a5a12]',
    mark: 'text-[#d9aa32]',
  },
  'shooting-star': {
    glyph: '✦',
    earns: false,
    text: 'text-indigo-700',
    chip: 'border-indigo-200 bg-indigo-50 text-indigo-800',
    mark: 'text-indigo-400',
  },
  'star-shout-out': {
    glyph: '❝',
    earns: false,
    text: 'text-teal-700',
    chip: 'border-teal-200 bg-teal-50 text-teal-800',
    mark: 'text-teal-500',
  },
  'warren-employee-month': {
    glyph: '🏆',
    earns: false,
    text: 'text-[#7a4b12]',
    chip: 'border-[#d7b44b] bg-[#fdf3d8] text-[#7a4b12]',
    mark: 'text-[#b8892f]',
  },
  'all-star-of-month': {
    glyph: '🥇',
    earns: false,
    text: 'text-orange-700',
    chip: 'border-orange-200 bg-orange-50 text-orange-800',
    mark: 'text-orange-500',
  },
}

export const DEFAULT_RECOGNITION_ACCENT = {
  glyph: '★',
  earns: false,
  text: 'text-gray-600',
  chip: 'border-gray-200 bg-gray-50 text-gray-700',
  mark: 'text-gray-400',
}

export function recognitionAccent(typeId) {
  return RECOGNITION_ACCENTS[typeId] || DEFAULT_RECOGNITION_ACCENT
}

// Liz's printed Shout-Out card names each reason and then explains it:
// "COMPASSIONATE SERVICE — Shows patience or kindness when helping students".
// The app showed only the explanation, so a manager holding the card and a
// manager looking at the screen were choosing from two lists that did not look
// like each other.
//
// Keyed by the value already stored on records, so nothing recorded has to
// change and the history of past shout-outs picks up the names too.
export const CRITERION_LABELS = {
  'Showing patience or kindness when helping students': {
    name: 'Compassionate Service',
    description: 'Shows patience or kindness when helping students',
  },
  'Participating in school functions beyond regular duties': {
    name: 'Community Contributor',
    description: 'Participates in school activities beyond job duties',
  },
  'Working with teachers and communicating effectively': {
    name: 'Effective Communicator',
    description: 'Works with teachers & staff effectively',
  },
  'Creating a positive cafeteria environment for students': {
    name: 'Resilient Leader',
    description: 'Creating a positive cafeteria environment for all',
  },
}

// Falls back to the stored value as its own name, so a reason with no card
// wording — the Shooting Star list, or anything added later — still reads
// correctly rather than rendering blank.
export function criterionLabel(value) {
  return CRITERION_LABELS[value] || { name: value, description: '' }
}

// --- the manager / hourly split --------------------------------------------
//
// Liz's ask: the people who run the kitchens are recognised in their own pool
// rather than competing with the staff they supervise. Eighteen people —
// fifteen Worker Leads, two Managers and the Director.
//
// Membership is read from the roster's position rather than stamped on each
// record. That is what "their accumulated stars need to be changed over"
// becomes in practice: nothing is rewritten, no live record is touched, and
// every star these eighteen have already earned simply counts in the manager
// pool from the moment the split is switched on.
//
// The trade-off, worth knowing: if somebody is promoted from Cook to Lead,
// the stars they earned as a Cook move pools with them. Stamping the position
// onto each record at the time it was given would avoid that, but it would
// mean rewriting live history to get the backdating Liz asked for.
export const MANAGER_GRADE_POSITIONS = [
  'Food Service Worker Lead',
  'Food Service Manager',
  'Food Service Director',
]

export function isManagerGrade(employee) {
  return MANAGER_GRADE_POSITIONS.includes(String(employee?.position || '').trim())
}

export function managerEmployeeIds(employees) {
  return new Set(
    (Array.isArray(employees) ? employees : [])
      .filter(isManagerGrade)
      .map(employee => String(employee.kronos_id || employee.id || ''))
      .filter(Boolean)
  )
}

// District-wide on purpose. Eleven of the fourteen buildings that have a
// manager-grade person have exactly one, so a per-building manager drawing
// would draw the same single name every month and would not be a drawing.
export function getManagerDrawingEntries(records, monthKey, managerIds) {
  if (!managerIds || !managerIds.size) return []
  return (Array.isArray(records) ? records : []).filter(record =>
    record.type === 'star-of-day'
    && managerIds.has(String(record.employeeId))
    && String(record.date || '').startsWith(`${monthKey}-`)
  )
}

export function drawManagerAllStar(records, monthKey, managerIds, randomValue = Math.random()) {
  const entries = getManagerDrawingEntries(records, monthKey, managerIds)
  if (!entries.length) return null
  const boundedRandom = Math.max(0, Math.min(Number(randomValue) || 0, 0.999999999))
  const winningEntry = entries[Math.floor(boundedRandom * entries.length)]
  return {
    employeeId: winningEntry.employeeId,
    entryCount: entries.filter(entry => entry.employeeId === winningEntry.employeeId).length,
    totalEntries: entries.length,
  }
}

// Splits any leaderboard into the two pools, so each board only ranks people
// against others doing the same job.
export function splitLeaderboardByGrade(entries, managerIds) {
  const managers = []
  const staff = []
  for (const entry of Array.isArray(entries) ? entries : []) {
    const id = String(entry?.employee?.kronos_id || entry?.employee?.id || '')
    if (managerIds && managerIds.has(id)) managers.push(entry)
    else staff.push(entry)
  }
  return { managers, staff }
}

// Who actually got the stars in a building, month by month.
//
// The counts table answers "how many"; this answers "who", which is the
// question a manager asks next. Same rule as every other figure on the page:
// Star of the Day only, this school year only, counted for the building the
// person works in.
export function buildingMonthlyRecipients(records, startYear, locationId) {
  const months = new Map()

  for (const record of Array.isArray(records) ? records : []) {
    if (!recognitionEarnsStar(record)) continue
    if (!isRecognitionInSchoolYear(record, startYear)) continue
    if (String(record.locationId || '') !== String(locationId || '')) continue
    const monthKey = String(record.date || '').slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(monthKey)) continue

    if (!months.has(monthKey)) months.set(monthKey, new Map())
    const people = months.get(monthKey)
    const employeeId = String(record.employeeId)
    people.set(employeeId, (people.get(employeeId) || 0) + 1)
  }

  // Newest month first — the month someone is asking about is usually this one.
  return [...months.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([monthKey, people]) => ({
      monthKey,
      total: [...people.values()].reduce((sum, count) => sum + count, 0),
      recipients: [...people.entries()]
        .map(([employeeId, count]) => ({ employeeId, count }))
        .sort((left, right) => right.count - left.count
          || left.employeeId.localeCompare(right.employeeId)),
    }))
}
