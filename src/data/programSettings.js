// Program settings Liz can change without a deploy.
//
// Everything here used to be a constant in a source file, which meant that
// "the Gold Star should be 25, not 20" was a code change, a build and a
// release. These are her decisions, not engineering ones, so they live in
// shared state like every other record the app keeps.
//
// Three rules the whole module follows:
//
//   1. A stored setting is an OVERRIDE, never a replacement. Anything absent
//      or malformed falls back to the default, so a half-written settings
//      blob degrades to the shipped behavior rather than to nothing.
//   2. Every write is validated as strictly as a form would validate it. The
//      Settings page is the only writer today, but a bad value here changes
//      what the app says about somebody's job.
//   3. Every write records who made it and when. These settings decide
//      discipline stages and compliance hours; "who moved the threshold" has
//      to be answerable.
import { writeSharedStorage } from './sharedStore.js'
import {
  DEFAULT_COACH_MILESTONES,
  DEFAULT_CRITERION_LABELS,
  DEFAULT_OCCURRENCE_THRESHOLDS,
  DEFAULT_POSITION_TRAINING_HOURS,
  DEFAULT_STAR_LEVELS,
} from './programDefaults.js'

export const PROGRAM_SETTINGS_KEY = 'program-settings-v1'

function readSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROGRAM_SETTINGS_KEY) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function getProgramSettings() {
  return readSettings()
}

// --- resolvers -------------------------------------------------------------
//
// Each one answers "what is in force right now". Call these rather than the
// DEFAULT_ constants anywhere the answer is shown to somebody or used in a
// calculation.

export function starLevels() {
  const stored = readSettings().starLevels
  if (!Array.isArray(stored) || !stored.length) return DEFAULT_STAR_LEVELS

  const levels = stored
    .map(level => ({
      id: String(level?.id || '').trim(),
      name: String(level?.name || '').trim(),
      minimum: Number(level?.minimum),
      symbol: String(level?.symbol || '').trim() || '⭐',
    }))
    .filter(level => level.id && level.name && Number.isFinite(level.minimum) && level.minimum > 0)
    .sort((left, right) => left.minimum - right.minimum)

  // A stored list that survives validation with nothing in it means the blob
  // is broken, not that the district has no milestones.
  return levels.length ? levels : DEFAULT_STAR_LEVELS
}

// Same shape and same validation as starLevels, deliberately: these are the
// same kind of decision about a different track, and Liz should be able to
// rename a coach milestone exactly as she renames a star one.
export function coachMilestones() {
  const stored = readSettings().coachMilestones
  if (!Array.isArray(stored) || !stored.length) return DEFAULT_COACH_MILESTONES

  const levels = stored
    .map(level => ({
      id: String(level?.id || '').trim(),
      name: String(level?.name || '').trim(),
      minimum: Number(level?.minimum),
      symbol: String(level?.symbol || '').trim() || '◆',
    }))
    .filter(level => level.id && level.name && Number.isFinite(level.minimum) && level.minimum > 0)
    .sort((left, right) => left.minimum - right.minimum)

  return levels.length ? levels : DEFAULT_COACH_MILESTONES
}

export function occurrenceThresholds() {
  const stored = readSettings().occurrence || {}
  const tracking = Number(stored.tracking)
  // verbalWarning is the name this field had before 2026-10-19, when the app
  // stopped claiming a verbal warning had happened. A district that saved a
  // value under the old name keeps it.
  const formalAction = Number(stored.formalAction ?? stored.verbalWarning)
  const valid = Number.isInteger(tracking) && Number.isInteger(formalAction)
    && tracking >= 1 && formalAction > tracking
  return valid ? { tracking, formalAction } : DEFAULT_OCCURRENCE_THRESHOLDS
}

export function positionTrainingHours() {
  const stored = readSettings().trainingHours
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return DEFAULT_POSITION_TRAINING_HOURS
  }
  const hours = {}
  for (const [position, value] of Object.entries(stored)) {
    const title = String(position || '').trim()
    if (!title) continue
    // null is meaningful here: it is how a position is marked as having no
    // requirement set, which must not be confused with zero hours.
    if (value === null) { hours[title] = null; continue }
    const number = Number(value)
    if (Number.isFinite(number) && number >= 0 && number <= 100) hours[title] = number
  }
  return Object.keys(hours).length ? hours : DEFAULT_POSITION_TRAINING_HOURS
}

export function criterionLabels() {
  const stored = readSettings().criterionLabels
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return DEFAULT_CRITERION_LABELS
  }
  const labels = { ...DEFAULT_CRITERION_LABELS }
  for (const [value, label] of Object.entries(stored)) {
    const name = String(label?.name || '').trim()
    if (!value || !name) continue
    labels[value] = { name, description: String(label?.description || '').trim() }
  }
  return labels
}

// Who signed the Spanish wording off, and when. Unset means the screens keep
// saying the wording is still under review.
export function spanishApproval() {
  const stored = readSettings().spanishApproval
  const approvedBy = String(stored?.approvedBy || '').trim()
  const approvedOn = String(stored?.approvedOn || '').trim()
  return approvedBy && /^\d{4}-\d{2}-\d{2}$/.test(approvedOn) ? { approvedBy, approvedOn } : null
}

// --- writing ---------------------------------------------------------------

export class SettingsError extends Error {}

function fail(message) {
  throw new SettingsError(message)
}

// Validated here rather than in the page so the rules hold for any caller,
// and so they can be tested without a browser.
export function validateSettingsPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) fail('Nothing to save.')

  for (const section of ['starLevels', 'coachMilestones']) {
    if (!(section in patch)) continue
    const levels = patch[section]
    if (!Array.isArray(levels) || !levels.length) fail('Keep at least one milestone.')
    const seen = new Set()
    for (const level of levels) {
      if (!String(level?.name || '').trim()) fail('Every milestone needs a name.')
      const minimum = Number(level?.minimum)
      if (!Number.isInteger(minimum) || minimum < 1) fail(`"${level.name}" needs a whole number, at least 1.`)
      if (seen.has(minimum)) fail(`Two milestones both start at ${minimum}.`)
      seen.add(minimum)
    }
  }

  if ('occurrence' in patch) {
    const tracking = Number(patch.occurrence?.tracking)
    const formalAction = Number(patch.occurrence?.formalAction ?? patch.occurrence?.verbalWarning)
    if (!Number.isInteger(tracking) || tracking < 1) fail('Manager tracking must start at occurrence 1 or later.')
    if (!Number.isInteger(formalAction)) fail('The formal-tracking stage needs a whole number.')
    if (formalAction <= tracking) fail('Formal tracking has to come after manager tracking.')
  }

  if ('trainingHours' in patch) {
    for (const [position, value] of Object.entries(patch.trainingHours || {})) {
      if (value === null) continue
      const hours = Number(value)
      if (!Number.isFinite(hours) || hours < 0) fail(`${position} needs a number of hours, or no requirement at all.`)
      if (hours > 100) fail(`${position}: ${hours} hours looks like a mistake.`)
    }
  }

  if ('criterionLabels' in patch) {
    for (const [value, label] of Object.entries(patch.criterionLabels || {})) {
      if (!String(label?.name || '').trim()) fail(`The reason "${value}" needs a name.`)
    }
  }

  if ('spanishApproval' in patch && patch.spanishApproval !== null) {
    if (!String(patch.spanishApproval?.approvedBy || '').trim()) fail('Record who approved the Spanish wording.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(patch.spanishApproval?.approvedOn || ''))) {
      fail('Record the date the Spanish wording was approved.')
    }
  }

  return true
}

export function saveProgramSettings(patch, { changedBy = '' } = {}) {
  validateSettingsPatch(patch)
  const current = readSettings()
  const next = {
    ...current,
    ...patch,
    changedAt: new Date().toISOString(),
    changedBy: String(changedBy || '').trim().slice(0, 80),
  }
  writeSharedStorage(PROGRAM_SETTINGS_KEY, next)
  return next
}

// Puts a section back to the shipped default by removing the override, rather
// than writing the current default in as a value — otherwise a later change to
// the default would not reach a district that had "reset" to it.
export function resetProgramSetting(section, { changedBy = '' } = {}) {
  const next = { ...readSettings() }
  if (!(section in next)) return next
  delete next[section]
  next.changedAt = new Date().toISOString()
  next.changedBy = String(changedBy || '').trim().slice(0, 80)
  writeSharedStorage(PROGRAM_SETTINGS_KEY, next)
  return next
}

// When Liz last downloaded a backup.
//
// Kept in this key rather than a new one because it is already Liz-tier,
// already synced to every device she signs in on, and already in the SQL
// allowlist — a reminder does not justify a migration, and a new state key
// is four places that can drift.
//
// Deliberately does NOT stamp changedAt or changedBy the way
// saveProgramSettings does. Running a backup is not changing the
// programme, and the settings audit must not claim she edited milestones
// on a day she only pressed download.
export function recordBackupExport(at = new Date()) {
  const next = { ...readSettings(), lastBackupExportAt: at.toISOString() }
  writeSharedStorage(PROGRAM_SETTINGS_KEY, next)
  return next.lastBackupExportAt
}

export function lastBackupExport() {
  const value = String(readSettings().lastBackupExportAt || '')
  return Number.isFinite(Date.parse(value)) ? value : null
}

export function settingsAudit() {
  const stored = readSettings()
  const changedAt = String(stored.changedAt || '')
  if (!changedAt) return null
  return { changedAt, changedBy: String(stored.changedBy || '') }
}

// Which sections differ from the shipped defaults, for the "customised" marks
// on the Settings page.
export function customisedSections() {
  const stored = readSettings()
  return ['starLevels', 'coachMilestones', 'occurrence', 'trainingHours', 'criterionLabels', 'spanishApproval']
    .filter(section => section in stored && stored[section] !== null)
}
