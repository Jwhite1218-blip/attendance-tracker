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
  ],
  'star-shout-out': [
    'Creating a positive cafeteria environment for students',
    'Participating in school functions beyond regular duties',
    'Working with teachers and communicating effectively',
    'Showing patience or kindness when helping students',
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

// Star of the Day is the award managers give daily, so it carries the message
// requirement. Nominations and shout-outs stay lighter-weight on purpose.
export function requiresStarMessage(type) {
  return type === 'star-of-day'
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

export function getMonthlyDrawingEntries(records, locationId, monthKey) {
  return records.filter(record =>
    record.type === 'star-of-day'
    && record.locationId === locationId
    && String(record.date || '').startsWith(`${monthKey}-`)
  )
}

export function drawMonthlyAllStar(records, locationId, monthKey, randomValue = Math.random()) {
  const entries = getMonthlyDrawingEntries(records, locationId, monthKey)
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
