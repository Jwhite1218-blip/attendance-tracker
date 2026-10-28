import { writeSharedStorage } from './sharedStore.js'
import { DEFAULT_CRITERION_LABELS, DEFAULT_STAR_LEVELS } from './programDefaults.js'
import { criterionLabels, starLevels } from './programSettings.js'

export const RECOGNITION_STORAGE_KEY = 'all-star-recognition-v1'

// The shipped milestones. What the district actually uses comes from
// starLevels() in programSettings, which falls back to exactly this.
export const STAR_LEVELS = DEFAULT_STAR_LEVELS

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
    description: 'A special recognition received from a student, teacher, staff member, or another manager.',
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
  {
    // The Leadership Track's equivalent of a Daily Star. Jon, 2026-10-19:
    // "Admin would give out the manager/food service worker lead Stars or
    // 'Ace Star Bucks' to be tracked like the employee Star of the Day."
    //
    // That settled the one question that had blocked this for weeks — it is
    // awarded top-down by the district, not peer to peer between buildings.
    // Which means no new permission: an admin session already writes
    // recognition for anybody, while a school session is narrowed to its own
    // roster in recognitionMutationForSession. Peer awarding would have meant
    // widening that, and it does not.
    id: 'ace-buck',
    label: 'ACE Coach Buck',
    shortLabel: 'Coach Buck',
    description: 'District recognition for a kitchen manager. Counts toward ACE Coach milestones.',
    earnsStar: true,
    actionLabel: 'Award an ACE Coach Buck',
    districtOnly: true,
    managerGradeOnly: true,
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

// The one reason that cannot stand alone — see createRecognitionRecord.
export const OTHER_REASON = 'Other'

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

// The eight ACE Bucks categories, verbatim from Liz's programme document
// (ACE Bucks recognition.pdf, supplied 2026-09-28).
export const ACE_BUCK_CATEGORIES = [
  'People & Culture',
  'Safety Leader',
  'Operational Excellence',
  'Communication',
  'Customer Experience',
  'Marketing & Promotion',
  'Innovation',
  'ACE Moment',
]

export const RECOGNITION_CRITERIA = {
  'star-of-day': ALL_STAR_REASON_OPTIONS,
  'ace-buck': ACE_BUCK_CATEGORIES,
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

  // "Other" on its own tells the person holding the card nothing. Liz,
  // 2026-10-19: it takes a free-text line saying what it actually was, and
  // that line is what prints on the card in place of the word.
  const otherReason = String(input.otherReason || '').trim().slice(0, 120)
  // Required only where it is printed. A Star of the Day card lists the
  // reasons on its face, so "other" with nothing beside it is a blank on a
  // card somebody is handed. The nomination surfaces carry their reason in
  // the message instead and are left as they were.
  if (type === 'star-of-day' && criteria.includes(OTHER_REASON) && !otherReason) {
    throw new Error('Say what the other reason was.')
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
    // Only kept when it is actually in use, so a record cannot carry a
    // stale explanation for a reason that was unticked before saving.
    otherReason: criteria.includes(OTHER_REASON) ? otherReason : '',
    note,
    sourceName: String(input.sourceName || '').trim().slice(0, 200),
    recognizedBy: String(input.recognizedBy || '').trim().slice(0, 200),
    // Which building submitted this, so the district can see where recognition
    // is (and is not) happening. The server overwrites this from the session, so
    // a client cannot claim to be another building. PINs themselves are never
    // stored — the signed-in building is what answers "which school".
    recognizedByLocationId: String(input.recognizedByLocationId || '').trim().slice(0, 100),
    // Liz, 2026-10-27: "if 5 out of 10 employees in the kitchen did
    // something great and you want to reward the group with one
    // recognition card but it would mark an individual star each."
    //
    // So five records, each a real star that counts toward that person's
    // own milestone and earns their own drawing entry, tied together by a
    // shared id. The id is what lets the card printer know they were one
    // award and print one card with five names rather than five cards.
    //
    // Absent on a single award, which is almost all of them.
    ...(String(input.groupId || '').trim()
      ? { groupId: String(input.groupId).trim().slice(0, 120) }
      : {}),
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
    if (!earnsDailyStar(record)) return
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

// One award, several people. Each gets their own record — see groupId in
// createRecognitionRecord for why that is the right shape rather than one
// record naming five people.
//
// Written in a single save so the five either all land or none do. Building
// them first means a bad one throws before anything is stored, rather than
// leaving two stars recorded and three not.
export function addRecognitionGroup(input, people, options = {}) {
  const seen = new Set()
  const chosen = (Array.isArray(people) ? people : [])
    .map(person => ({
      employeeId: String(person?.employeeId ?? person ?? '').trim(),
      // Each record keeps its own building rather than borrowing the first
      // person's, so the figures stay right if a group award is ever
      // allowed to cross one.
      locationId: String(person?.locationId || input?.locationId || '').trim(),
    }))
    .filter(person => person.employeeId && !seen.has(person.employeeId) && seen.add(person.employeeId))
  if (!chosen.length) throw new Error('Choose at least one person.')

  const groupId = chosen.length > 1
    ? (options.groupId || `group-${Date.now()}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`)
    : ''

  const built = chosen.map(person => createRecognitionRecord(
    { ...input, ...person, groupId },
    { ...options, id: undefined, createdAt: options.createdAt }
  ))

  const records = readRecognitionMap()
  for (const record of built) records[record.id] = record
  writeSharedStorage(RECOGNITION_STORAGE_KEY, records)
  return built
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

// "Does this recognition earn something" — true for a Daily Star and for an
// ACE Coach Buck, false for a nomination. Used where the question is whether
// an award counts at all, such as whether the feed should say "no star".
export function recognitionEarnsStar(record) {
  return RECOGNITION_TYPE_MAP[record?.type]?.earnsStar === true
}

// "Is this a Star of the Day" — the question almost every figure on the
// All-Star page is actually asking.
//
// Found on 2026-10-19 while previewing what an ACE Coach Buck would do to a
// manager's record, before any had been awarded. A Buck earns, so it passed
// recognitionEarnsStar, so it was being counted as a star by seven different
// figures — including the employee record, where the same award appeared
// once as a star and once as a Buck and could have pushed somebody to Silver
// on a currency they had not earned. Each of those places says "Star of the
// Day only" in a comment or on the screen.
export function earnsDailyStar(record) {
  return recognitionEarnsStar(record) && !isAceBuck(record)
}

export function getEmployeeStarCount(records, employeeId, startYear) {
  return records.filter(record =>
    String(record.employeeId) === String(employeeId)
    && isRecognitionInSchoolYear(record, startYear)
    && earnsDailyStar(record)
  ).length
}

// Liz, 2026-10-10: "can we track that so we know where they worked and where
// they earned the stars?" The stars half needs no new storage — every
// recognition record already carries the building it was given in, so an
// employee who moved mid-year can be shown what they earned at each stop.
// Pass startYear as null to count across every school year on record.
export function employeeStarsByLocation(records, employeeId, startYear = null) {
  const counts = new Map()
  for (const record of records || []) {
    if (String(record.employeeId) !== String(employeeId)) continue
    if (startYear != null && !isRecognitionInSchoolYear(record, startYear)) continue
    if (!earnsDailyStar(record)) continue
    const locationId = String(record.locationId || '').trim() || 'unassigned'
    counts.set(locationId, (counts.get(locationId) || 0) + 1)
  }
  return [...counts.entries()]
    .map(([locationId, count]) => ({ locationId, count }))
    .sort((left, right) => right.count - left.count || left.locationId.localeCompare(right.locationId))
}

// An ACE Buck earns, like a Daily Star earns — but for a different pool and
// against different milestones, so the two must never be added together. A
// manager who picked up Daily Stars before this existed keeps them in their
// own count; they are not ACE Bucks and do not become them.
export function isAceBuck(record) {
  return record?.type === 'ace-buck'
}

export function getAceBuckCount(records, employeeId, startYear) {
  return (records || []).filter(record =>
    String(record.employeeId) === String(employeeId)
    && isRecognitionInSchoolYear(record, startYear)
    && isAceBuck(record)
  ).length
}

// District figures for the dashboard tiles. The counters above answer "how
// much has one person earned"; these answer "what happened here", so they
// filter on the building a recognition was given at rather than on an
// employee id.
//
// They return the records, not a number. Liz, 2026-10-26, asked the tiles
// to open: a tile and its drill-down that each ran their own filter would
// eventually disagree about which records they were describing, and the
// drill-down is how anybody would notice the count was wrong.
//
// An empty locationIds means the whole district, the same shape the school
// pills use — All district is an empty selection, so the tiles and the
// pills cannot disagree about what "all" means.
function inLocationScope(record, scope) {
  return scope.size === 0 || scope.has(String(record?.locationId || ''))
}

export function dailyStarsInMonth(records, monthKey, locationIds = []) {
  const scope = new Set((locationIds || []).map(String))
  return (records || []).filter(record =>
    earnsDailyStar(record)
    && String(record.date || '').startsWith(`${monthKey}-`)
    && inLocationScope(record, scope)
  )
}

// Liz, 2026-10-26, asked for ACE Bucks and then the two nomination counts
// "for the year". The recognition year is the school year, not the calendar
// year — an award earned in May belongs with one earned the previous
// September, and resetting in January would split a programme that runs
// August to June in half.
export function recognitionsOfTypeInSchoolYear(records, type, startYear, locationIds = []) {
  const scope = new Set((locationIds || []).map(String))
  return (records || []).filter(record =>
    record?.type === type
    && isRecognitionInSchoolYear(record, startYear)
    && inLocationScope(record, scope)
  )
}

export function aceBucksInSchoolYear(records, startYear, locationIds = []) {
  return recognitionsOfTypeInSchoolYear(records, 'ace-buck', startYear, locationIds)
}

// Deliberately excludes ACE Bucks, so an employee star count stays an
// employee star count even for a manager who holds both.
export function getDailyStarCount(records, employeeId, startYear) {
  return (records || []).filter(record =>
    String(record.employeeId) === String(employeeId)
    && isRecognitionInSchoolYear(record, startYear)
    && earnsDailyStar(record)
  ).length
}

export function getStarLevel(count) {
  return [...starLevels()].reverse().find(level => Number(count) >= level.minimum) || null
}

export function getNextStarLevel(count) {
  return starLevels().find(level => Number(count) < level.minimum) || null
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
    if (!earnsDailyStar(record)) continue
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
// stable set of columns even in a month nobody was recognized.
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
// Printable cards. One per star, except that a group award prints once
// with everybody's name on it — Liz, 2026-10-27: "reward the group with one
// recognition card but it would mark an individual star each."
//
// Order is preserved: a group card appears where its first star did, so a
// sheet still reads in the order the stars were given.
export function toStarCardEntries(records, resolveName) {
  const cards = []
  const byGroup = new Map()

  for (const record of (Array.isArray(records) ? records : [])) {
    if (record?.type !== 'star-of-day') continue
    const name = resolveName(record.employeeId) || String(record.employeeId || '')
    const groupId = String(record.groupId || '').trim()

    if (groupId && byGroup.has(groupId)) {
      // Same award, another person. Their name joins the card already made.
      byGroup.get(groupId).names.push(name)
      continue
    }

    const card = {
      name,
      names: [name],
      date: record.date,
      criteria: record.criteria || [],
      otherReason: record.otherReason || '',
      message: record.note || '',
      recognizedBy: record.recognizedBy || '',
    }
    if (groupId) byGroup.set(groupId, card)
    cards.push(card)
  }

  // A single card keeps exactly the shape it has always had — `names` only
  // appears on a group, so nothing that reads one card has to learn about
  // groups to stay correct.
  return cards.map(card => {
    if (card.names.length > 1) return { ...card, name: card.names.join(', ') }
    const { names: _names, ...single } = card
    return single
  })
}

// Liz asked for Shout-Outs and Shooting Stars to read differently from the
// daily star, because they are different things: only Star of the Day earns a
// star and a drawing entry. Kept here rather than in the page so the entry
// form, the history list and any later surface cannot drift apart.
//
// `earns` marks the two that actually add to someone's star count, so the
// distinction is visible at a glance and not just a color difference.
export const RECOGNITION_ACCENTS = {
  // Blue, matching the ACE Coach board, so an ACE Buck reads as belonging to
  // the Leadership Track at a glance rather than looking like a gold star
  // that happened to land on a manager.
  'ace-buck': {
    glyph: '◆',
    earns: true,
    text: 'text-[#12407f]',
    chip: 'border-[#9ecbff] bg-[#eaf3ff] text-[#12407f]',
    mark: 'text-[#1a56c4]',
  },
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
// The shipped card wording. criterionLabels() in programSettings is what the
// screens read, and it falls back to exactly this.
export const CRITERION_LABELS = DEFAULT_CRITERION_LABELS

// Falls back to the stored value as its own name, so a reason with no card
// wording — the Shooting Star list, or anything added later — still reads
// correctly rather than rendering blank.
export function criterionLabel(value) {
  return criterionLabels()[value] || { name: value, description: '' }
}

// --- the manager / hourly split --------------------------------------------
//
// Liz's ask: the people who run the kitchens are recognized in their own pool
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

// The district office, where the Director and the two Food Service Managers
// sit. Manager-grade, but they do not run a kitchen.
export const DISTRICT_OFFICE_LOCATION = 'Admin'

// Who an ACE Coach Buck may be awarded to. Liz, 2026-10-19: "only awarded to
// kitchen managers" — so the district office is excluded even though those
// three are manager-grade and still appear on the manager leaderboard.
//
// Keyed on where somebody works rather than on their job title, because a
// Food Service Manager posted to a building would be running a kitchen and
// should be eligible, while the same title at the district office is not.
export function isKitchenManager(employee) {
  if (!isManagerGrade(employee)) return false
  return String(employee?.location || '').trim() !== DISTRICT_OFFICE_LOCATION
}

export function kitchenManagerIds(employees) {
  return new Set(
    (employees || [])
      .filter(isKitchenManager)
      .map(employee => String(employee.kronos_id || employee.id))
  )
}

// Manager-grade: the pool a Shout-Out may cross a building boundary to
// reach, and the pool ranked on the manager leaderboard.
//
// Two ways in, and the second matters. Liz, 2026-10-27: Cherese and Marlene
// are Assistant Directors, not Food Service Managers, and she wants to add
// district office staff like Van Parham in marketing so a kitchen manager
// can thank them.
//
// Judging purely on job title made both of those break things. Correcting
// the two titles would have silently removed them from every kitchen
// manager's Shout-Out list, and every new district-office title would have
// needed a code change before that person could be thanked at all — with
// no error, just a name missing from a dropdown.
//
// So anyone at the district office is manager-grade whatever their title.
// It is a small office of senior staff, which is the thing the title list
// was approximating in the first place.
//
// This does not make them kitchen managers: isKitchenManager still excludes
// the office, so ACE Coach Bucks stay with the people running kitchens, and
// a Star of the Day is still scoped to the giver's own building.
export function isManagerGrade(employee) {
  if (String(employee?.location || '').trim() === DISTRICT_OFFICE_LOCATION) return true
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
    if (!earnsDailyStar(record)) continue
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

// Two independent things are being signaled on the recognition screens, and
// they must not fight each other:
//
//   recognitionAccent() — WHAT the recognition is (daily star, nomination,
//     shout-out). Owns the glyph and the chip.
//   gradeAccent()       — WHO earned it (staff or manager). Owns the star
//     color on the boards, and a chip beside the name in the history.
//
// Managers get the ACE orange of the coach program rather than the All-Star
// gold, so which board you are looking at is obvious at a glance without
// reading the tab.
export const GRADE_ACCENTS = {
  staff: {
    label: 'Staff',
    rank: 'bg-[#211b12] text-[#ffd75c]',
    count: 'text-[#ad741e]',
    bar: 'from-[#ad741e] to-[#f1cd57]',
    tab: 'bg-[#ad741e]',
    chip: 'border-amber-300 bg-amber-50 text-[#8a5a12]',
    note: 'border-amber-200 bg-amber-50 text-amber-900',
  },
  // Blue, and deliberately not a neighbour of the All-Star gold. An orange
  // first attempt sat too close to the gold to register at a glance, which
  // defeated the point: the two programs have to be tellable apart across a
  // room, not on close inspection.
  manager: {
    label: 'ACE Coach',
    rank: 'bg-[#0d2a57] text-[#9ecbff]',
    count: 'text-[#1a56c4]',
    bar: 'from-[#1a56c4] to-[#7cb6ff]',
    tab: 'bg-[#1a56c4]',
    chip: 'border-[#9ecbff] bg-[#eaf3ff] text-[#12407f]',
    note: 'border-[#9ecbff] bg-[#eaf3ff] text-[#12407f]',
  },
}

export function gradeAccent(isManager) {
  return isManager ? GRADE_ACCENTS.manager : GRADE_ACCENTS.staff
}
