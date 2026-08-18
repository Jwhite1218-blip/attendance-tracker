// Automatic HR accountability flags.
// Any employee who racks up 3 qualifying occurrences (unexcused absence or
// late/early quit) in the same attendance year gets permanently flagged —
// their name tag turns red everywhere in the app, and the occurrence is
// logged here for HR's reference list on the admin Dashboard.
//
// Approved/protected absences (RTO, RTOP, bereavement/jury duty, medical/
// FMLA) never count toward this — only codes that represent a no-show or
// lateness problem.
//
// Flags are permanent once triggered: there's no auto-clear, and no
// dismiss action. This is intentional — it's a documented record, not a
// live status.

const FLAGS_KEY = 'hr-flags' // { [empId]: { empId, year, flaggedAt, triggers: [{date, code}] } }
const STRIKE_THRESHOLD = 3

const QUALIFYING_CODES = new Set(['U', 'UP', 'U.5', 'UP.5', 'NCNS', 'CC', 'L/EQ'])

export function isQualifyingCode(code) {
  return QUALIFYING_CODES.has(code)
}

function getAllFlags() {
  try {
    return JSON.parse(localStorage.getItem(FLAGS_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveAllFlags(flags) {
  localStorage.setItem(FLAGS_KEY, JSON.stringify(flags))
}

// Call right after writing an attendance record. yearData is that
// employee's full { [dateKey]: {code, date} } bucket for the year the
// write just landed in. If they've now hit the threshold and aren't
// already flagged, permanently record the flag.
export function checkAndFlag(empId, year, yearData) {
  const flags = getAllFlags()
  if (flags[empId]) return // already flagged — permanent, nothing to do

  const triggers = Object.values(yearData)
    .filter(r => isQualifyingCode(r.code))
    .map(r => ({ date: r.date, code: r.code }))
    .sort((a, b) => a.date.localeCompare(b.date))

  if (triggers.length >= STRIKE_THRESHOLD) {
    flags[empId] = { empId, year, flaggedAt: new Date().toISOString(), triggers }
    saveAllFlags(flags)
  }
}

export function isFlagged(empId) {
  return !!getAllFlags()[empId]
}

// Most recently flagged first — for the admin reference list.
export function getAllFlaggedEmployees() {
  return Object.values(getAllFlags()).sort(
    (a, b) => new Date(b.flaggedAt) - new Date(a.flaggedAt)
  )
}
