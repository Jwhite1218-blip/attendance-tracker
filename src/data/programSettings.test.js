// These settings decide what the app says about somebody's job — which
// discipline stage they are at, how many training hours they owe. The tests
// that matter most are the ones proving a broken or hostile value falls back
// to the shipped default rather than taking effect.
import assert from 'node:assert/strict'
import test from 'node:test'
import { configureClientAccess, flushPendingWrites } from './sharedStore.js'
import {
  PROGRAM_SETTINGS_KEY,
  SettingsError,
  coachMilestones,
  criterionLabels,
  customisedSections,
  occurrenceThresholds,
  positionTrainingHours,
  resetProgramSetting,
  saveProgramSettings,
  settingsAudit,
  spanishApproval,
  starLevels,
  validateSettingsPatch,
} from './programSettings.js'
import { DEFAULT_OCCURRENCE_THRESHOLDS, DEFAULT_STAR_LEVELS } from './programDefaults.js'
import { getNextStarLevel, getStarLevel, criterionLabel } from './recognitionStore.js'
import { attendanceSeverityOf } from './hrFlags.js'
import { requiredHoursFor } from './trainingRecords.js'
import { installTestBrowserStorage } from './testBrowserStorage.js'

test.beforeEach(() => {
  installTestBrowserStorage()
  configureClientAccess({ role: 'admin', canManageRoster: true, canManageBlackouts: true })
})

function store(value) {
  localStorage.setItem(PROGRAM_SETTINGS_KEY, JSON.stringify(value))
}

test('with nothing saved, every resolver returns the shipped default', () => {
  assert.deepEqual(starLevels(), DEFAULT_STAR_LEVELS)
  assert.deepEqual(occurrenceThresholds(), DEFAULT_OCCURRENCE_THRESHOLDS)
  assert.equal(positionTrainingHours()['Cook'], 6)
  assert.equal(criterionLabels()['Working with teachers and communicating effectively'].name, 'Effective Communicator')
  assert.equal(spanishApproval(), null)
  assert.deepEqual(customisedSections(), [])
  assert.equal(settingsAudit(), null)
})

test('a saved change takes effect and is stamped with who made it', () => {
  saveProgramSettings({ occurrence: { tracking: 2, formalAction: 5 } }, { changedBy: 'Liz' })
  flushPendingWrites()

  assert.deepEqual(occurrenceThresholds(), { tracking: 2, formalAction: 5 })
  assert.deepEqual(customisedSections(), ['occurrence'])
  const audit = settingsAudit()
  assert.equal(audit.changedBy, 'Liz')
  assert.match(audit.changedAt, /^\d{4}-\d{2}-\d{2}T/)
})

// The whole point: a threshold change has to reach the code that decides
// whether somebody is being tracked, not just the settings screen.
test('changing the thresholds changes what the attendance screens show', () => {
  assert.equal(attendanceSeverityOf({ occurrenceCount: 2 }), 'none')
  saveProgramSettings({ occurrence: { tracking: 2, formalAction: 3 } }, { changedBy: 'Liz' })
  flushPendingWrites()
  assert.equal(attendanceSeverityOf({ occurrenceCount: 2 }), 'tracking')
  assert.equal(attendanceSeverityOf({ occurrenceCount: 3 }), 'action')
})

test('renaming the milestones changes what an employee record says', () => {
  assert.equal(getStarLevel(12).name, 'Silver Star')
  saveProgramSettings({
    starLevels: [
      { id: 'rookie', name: 'Rookie All-Star', minimum: 5, symbol: '⭐' },
      { id: 'rising', name: 'Rising Star', minimum: 10, symbol: '🌟' },
      { id: 'mvp', name: 'MVP', minimum: 20, symbol: '🏆' },
    ],
  }, { changedBy: 'Liz' })
  flushPendingWrites()

  assert.equal(getStarLevel(12).name, 'Rising Star')
  assert.equal(getNextStarLevel(12).name, 'MVP')
  assert.equal(getStarLevel(2), null, 'below the first milestone is still nothing')
})

test('milestones come back in order however they were entered', () => {
  store({ starLevels: [
    { id: 'c', name: 'Third', minimum: 30 },
    { id: 'a', name: 'First', minimum: 5 },
    { id: 'b', name: 'Second', minimum: 10 },
  ] })
  assert.deepEqual(starLevels().map(level => level.name), ['First', 'Second', 'Third'])
})

test('changing the training hours changes the compliance report', () => {
  assert.equal(requiredHoursFor({ position: 'Cook' }), 6)
  saveProgramSettings({ trainingHours: { Cook: 8, 'New Title': 4 } }, { changedBy: 'Liz' })
  flushPendingWrites()
  assert.equal(requiredHoursFor({ position: 'Cook' }), 8)
  assert.equal(requiredHoursFor({ position: 'New Title' }), 4)
})

// null is how a position is marked "no requirement set". Treating it as zero
// would report somebody as compliant the moment they did nothing.
test('a position can be set back to having no requirement at all', () => {
  saveProgramSettings({ trainingHours: { Cook: null } }, { changedBy: 'Liz' })
  flushPendingWrites()
  assert.equal(requiredHoursFor({ position: 'Cook' }), null)
})

test('renaming a recognition reason does not touch the stored records', () => {
  const stored = 'Working with teachers and communicating effectively'
  saveProgramSettings({ criterionLabels: { [stored]: { name: 'Team Player', description: 'Works well with staff' } } }, { changedBy: 'Liz' })
  flushPendingWrites()
  assert.equal(criterionLabel(stored).name, 'Team Player')
  assert.equal(criterionLabel('Showing patience or kindness when helping students').name, 'Compassionate Service', 'the others are untouched')
})

test('signing off the Spanish wording records who and when', () => {
  saveProgramSettings({ spanishApproval: { approvedBy: 'Liz', approvedOn: '2026-10-18' } }, { changedBy: 'Liz' })
  flushPendingWrites()
  assert.deepEqual(spanishApproval(), { approvedBy: 'Liz', approvedOn: '2026-10-18' })
})

// --- the part that actually protects people ---------------------------------

test('a malformed blob degrades to the shipped behavior, not to nothing', () => {
  for (const broken of ['not json', '[]', '"a string"', 'null']) {
    localStorage.setItem(PROGRAM_SETTINGS_KEY, broken)
    assert.deepEqual(starLevels(), DEFAULT_STAR_LEVELS, broken)
    assert.deepEqual(occurrenceThresholds(), DEFAULT_OCCURRENCE_THRESHOLDS, broken)
    assert.equal(positionTrainingHours()['Cook'], 6, broken)
  }
})

test('a section that survives validation empty falls back rather than erasing the program', () => {
  store({ starLevels: [{ name: 'No id or minimum' }] })
  assert.deepEqual(starLevels(), DEFAULT_STAR_LEVELS)

  store({ trainingHours: { '': 5, Cook: 'lots' } })
  assert.equal(positionTrainingHours()['Cook'], 6)
})

test('thresholds that would invert the stages are ignored', () => {
  for (const occurrence of [
    { tracking: 4, formalAction: 2 },
    { tracking: 0, formalAction: 1 },
    { tracking: 3, formalAction: 3 },
    { tracking: 2.5, formalAction: 4 },
    { tracking: 'three', formalAction: 'four' },
  ]) {
    store({ occurrence })
    assert.deepEqual(occurrenceThresholds(), DEFAULT_OCCURRENCE_THRESHOLDS, JSON.stringify(occurrence))
  }
})

test('validation refuses what the resolvers would have thrown away', () => {
  const cases = [
    [{ starLevels: [] }, /at least one milestone/],
    [{ starLevels: [{ name: '', minimum: 5 }] }, /needs a name/],
    [{ starLevels: [{ name: 'A', minimum: 0 }] }, /at least 1/],
    [{ starLevels: [{ name: 'A', minimum: 5 }, { name: 'B', minimum: 5 }] }, /both start at 5/],
    [{ occurrence: { tracking: 0, formalAction: 2 } }, /occurrence 1 or later/],
    [{ occurrence: { tracking: 3, formalAction: 2 } }, /after manager tracking/],
    [{ trainingHours: { Cook: -1 } }, /number of hours/],
    [{ trainingHours: { Cook: 500 } }, /looks like a mistake/],
    [{ criterionLabels: { 'a reason': { name: '' } } }, /needs a name/],
    [{ spanishApproval: { approvedBy: '', approvedOn: '2026-10-18' } }, /who approved/],
    [{ spanishApproval: { approvedBy: 'Liz', approvedOn: 'yesterday' } }, /the date/],
  ]
  for (const [patch, pattern] of cases) {
    assert.throws(() => validateSettingsPatch(patch), pattern, JSON.stringify(patch))
    assert.throws(() => saveProgramSettings(patch), SettingsError, JSON.stringify(patch))
  }
})

test('a refused save changes nothing that was already in force', () => {
  saveProgramSettings({ occurrence: { tracking: 2, formalAction: 5 } }, { changedBy: 'Liz' })
  flushPendingWrites()
  assert.throws(() => saveProgramSettings({ occurrence: { tracking: 9, formalAction: 1 } }))
  flushPendingWrites()
  assert.deepEqual(occurrenceThresholds(), { tracking: 2, formalAction: 5 })
})

// Reset removes the override rather than writing today's default in as a
// value, so a district that resets still follows the default if it changes.
test('resetting a section removes the override entirely', () => {
  saveProgramSettings({ occurrence: { tracking: 2, formalAction: 5 }, trainingHours: { Cook: 8 } }, { changedBy: 'Liz' })
  flushPendingWrites()
  assert.deepEqual(customisedSections().sort(), ['occurrence', 'trainingHours'])

  resetProgramSetting('occurrence', { changedBy: 'Liz' })
  flushPendingWrites()
  assert.deepEqual(occurrenceThresholds(), DEFAULT_OCCURRENCE_THRESHOLDS)
  assert.deepEqual(customisedSections(), ['trainingHours'], 'the other section is untouched')
  assert.equal('occurrence' in JSON.parse(localStorage.getItem(PROGRAM_SETTINGS_KEY)), false)
})

test('resetting something that was never set is harmless', () => {
  assert.doesNotThrow(() => resetProgramSetting('starLevels', { changedBy: 'Liz' }))
  assert.deepEqual(starLevels(), DEFAULT_STAR_LEVELS)
})

// Liz's programme document, confirmed 2026-10-19. Counted in ACE Bucks, and
// never mixed with the employee star milestones.
test('the coach milestones are the ones from the programme document', () => {
  assert.deepEqual(
    coachMilestones().map(level => [level.name, level.minimum]),
    [
      ['Rising Coach', 25],
      ['All-Star Coach', 50],
      ['Elite Coach', 100],
      ['Hall of Fame Coach', 150],
      ['ACE Coach of the Year', 200],
    ]
  )
})

test('coach milestones are editable and validated like star milestones', () => {
  saveProgramSettings({
    coachMilestones: [{ id: 'first', name: 'First Rung', minimum: 10, symbol: '◆' }],
  }, { changedBy: 'Liz' })
  flushPendingWrites()
  assert.deepEqual(coachMilestones().map(level => level.name), ['First Rung'])
  assert.ok(customisedSections().includes('coachMilestones'))

  assert.throws(() => saveProgramSettings({ coachMilestones: [] }), /at least one milestone/)
  assert.throws(() => saveProgramSettings({ coachMilestones: [{ name: '', minimum: 5 }] }), /needs a name/)
  assert.throws(
    () => saveProgramSettings({ coachMilestones: [{ name: 'A', minimum: 5 }, { name: 'B', minimum: 5 }] }),
    /both start at 5/
  )
})

test('the two tracks do not share milestones', () => {
  saveProgramSettings({ coachMilestones: [{ id: 'x', name: 'Coach Only', minimum: 7 }] }, { changedBy: 'Liz' })
  flushPendingWrites()
  assert.equal(starLevels().some(level => level.name === 'Coach Only'), false,
    'changing one track leaves the other alone')
  assert.deepEqual(starLevels(), DEFAULT_STAR_LEVELS)
})
