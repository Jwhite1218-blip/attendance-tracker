// Maps the program's own identifiers onto translation keys.
//
// Kept pure and separate from the React hook so the mapping can be tested
// under Node, and so there is exactly one place that knows an attendance code
// of 'RTO.5' is written 'code.RTO5' as a key, or that three different legacy
// codes collapse onto one legacy label.

import { normalizeAttendanceCode } from './attendanceCodes.js'

// Dots separate the parts of a key, so a code containing one has to be
// rewritten rather than passed through.
const CODE_KEY_OVERRIDES = {
  'RTO.5': 'RTO5',
  CC: 'legacy.CC',
  LE: 'legacy.LE',
  'L/EQ': 'legacy.LE',
  'B/J': 'legacy.BJ',
  O: 'legacy.O',
}

// The legacy entries are a single label with no separate description.
const LEGACY_KEYS = new Set(['legacy.CC', 'legacy.LE', 'legacy.BJ', 'legacy.O'])

function codeSegment(code) {
  const raw = String(code ?? '')
  if (!raw) return 'CLEAR'
  if (CODE_KEY_OVERRIDES[raw]) return CODE_KEY_OVERRIDES[raw]
  const normalized = normalizeAttendanceCode(raw)
  return CODE_KEY_OVERRIDES[normalized] || normalized
}

export function attendanceLabelKey(code) {
  const segment = codeSegment(code)
  return LEGACY_KEYS.has(segment) ? `code.${segment}` : `code.${segment}.label`
}

export function attendanceDescriptionKey(code) {
  const segment = codeSegment(code)
  // A legacy code has no description of its own; the label carries it.
  return LEGACY_KEYS.has(segment) ? `code.${segment}` : `code.${segment}.description`
}

// The occurrence count is a plural, so it comes back separately rather than
// baked into a key the caller cannot pluralise.
export function attendanceStageTerm(status) {
  if (!status) return { key: 'hr.none' }
  // The pre-2026-10-19 stage names are mapped rather than migrated; the
  // stage is recomputed on every write, so they age out on their own.
  if (status.stage === 'formal_action' || status.stage === 'verbal_warning') {
    return { key: 'hr.formalActionNeeded' }
  }
  if (status.stage === 'monitoring' || status.stage === 'formal_tracking') {
    return { key: 'hr.managerTracked' }
  }
  return { key: 'hr.occurrences', count: Number(status.occurrenceCount) || 0 }
}

const RECOGNITION_KEY_BY_TYPE = {
  'star-of-day': 'starOfDay',
  'shooting-star': 'shootingStar',
  'star-shout-out': 'shoutOut',
  'warren-employee-month': 'employeeOfMonth',
  'all-star-of-month': 'allStarOfMonth',
  'ace-buck': 'aceBuck',
}

export function recognitionLabelKey(typeId) {
  const segment = RECOGNITION_KEY_BY_TYPE[typeId]
  return segment ? `recognition.${segment}.label` : null
}

export function recognitionDescriptionKey(typeId) {
  const segment = RECOGNITION_KEY_BY_TYPE[typeId]
  return segment ? `recognition.${segment}.description` : null
}

export function starLevelKey(levelId) {
  return levelId ? `level.${levelId}` : null
}

export function reasonKey(reason) {
  return reason ? `reason.${reason}` : null
}

export function reasonDescriptionKey(reason) {
  return reason ? `reason.${reason}.description` : null
}
