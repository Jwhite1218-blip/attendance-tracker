// Where an employee has worked, and when they moved.
//
// Liz, 2026-10-10: "Option to Transfer employees is gone, now I have to go in
// and edit an employee to change their school — can we track that so we know
// where they worked and where they earned the stars?"
//
// A transfer overwrites the employee's location, so before this there was no
// record that the previous school ever existed. The stars half of her question
// needed no storage at all (recognition records already carry the building —
// see employeeStarsByLocation); this is the other half.
//
// Shape: { [employeeKey]: [{ from, to, at, by }] }, oldest first. Keyed by
// employee id to match every other per-employee shared key, which is what lets
// the server scope a map by roster without special-casing this one.
import { writeSharedStorage } from './sharedStore.js'

export const ASSIGNMENT_HISTORY_KEY = 'employee-assignment-history-v1'

function readHistoryMap() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ASSIGNMENT_HISTORY_KEY) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function normalizeEntries(value) {
  return (Array.isArray(value) ? value : [])
    .filter(entry => entry && typeof entry === 'object')
    .map(entry => ({
      from: String(entry.from || '').trim(),
      to: String(entry.to || '').trim(),
      at: String(entry.at || '').trim(),
      by: String(entry.by || '').trim(),
    }))
    .filter(entry => entry.to)
    .sort((left, right) => String(left.at).localeCompare(String(right.at)))
}

export function getAssignmentHistory(empKey) {
  return normalizeEntries(readHistoryMap()[String(empKey)])
}

export function getAllAssignmentHistory() {
  const map = readHistoryMap()
  return Object.fromEntries(
    Object.keys(map).map(key => [key, normalizeEntries(map[key])])
  )
}

// A move to the school they are already in is not a move. Recording it would
// put a meaningless row in a personnel record, and the edit form calls through
// here whenever the form is saved, not only when the location actually
// changed.
export function recordAssignmentChange(empKey, fromLocationId, toLocationId, actor = '') {
  const key = String(empKey)
  const from = String(fromLocationId || '').trim()
  const to = String(toLocationId || '').trim()
  if (!key || !to || from === to) return getAssignmentHistory(key)

  const map = readHistoryMap()
  const entries = [...normalizeEntries(map[key]), {
    from,
    to,
    at: new Date().toISOString(),
    by: String(actor || '').trim().slice(0, 80),
  }]
  map[key] = entries
  writeSharedStorage(ASSIGNMENT_HISTORY_KEY, map)
  return entries
}

// The full picture a manager wants to read: the school they started in,
// then every move. The starting school has to be inferred — nothing recorded
// it at the time — so it comes from the first move's `from`, and only falls
// back to where they are now when there has never been a move.
export function assignmentTimeline(empKey, currentLocationId) {
  const entries = getAssignmentHistory(empKey)
  if (!entries.length) {
    const current = String(currentLocationId || '').trim()
    return current ? [{ locationId: current, since: null, until: null }] : []
  }

  const stops = [{ locationId: entries[0].from || '', since: null, until: entries[0].at }]
  entries.forEach((entry, index) => {
    stops.push({
      locationId: entry.to,
      since: entry.at,
      until: index + 1 < entries.length ? entries[index + 1].at : null,
    })
  })
  return stops.filter(stop => stop.locationId)
}
