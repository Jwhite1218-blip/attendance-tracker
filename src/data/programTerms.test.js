import assert from 'node:assert/strict'
import test from 'node:test'
import { ATTENDANCE_CODES, LEGACY_CODE_ALIASES } from './attendanceCodes.js'
import { RECOGNITION_TYPES, STAR_LEVELS, ALL_STAR_REASON_OPTIONS } from './recognitionStore.js'
import { STRINGS } from './i18n.js'
import {
  attendanceDescriptionKey,
  attendanceLabelKey,
  attendanceStageTerm,
  reasonDescriptionKey,
  reasonKey,
  recognitionDescriptionKey,
  recognitionLabelKey,
  starLevelKey,
} from './programTerms.js'

const known = key => Object.hasOwn(STRINGS.en, key)

test('every attendance code maps onto wording that exists', () => {
  for (const code of ATTENDANCE_CODES) {
    assert.ok(known(attendanceLabelKey(code.code)), `no label for ${code.code}`)
    assert.ok(known(attendanceDescriptionKey(code.code)), `no description for ${code.code}`)
  }
})

test('a code containing a dot does not break the key', () => {
  // 'RTO.5' would otherwise read as code → RTO → 5.
  assert.equal(attendanceLabelKey('RTO.5'), 'code.RTO5.label')
  assert.ok(known('code.RTO5.label'))
})

test('legacy codes fall back to their one legacy label', () => {
  for (const code of ['CC', 'LE', 'L/EQ', 'B/J', 'O']) {
    assert.ok(known(attendanceLabelKey(code)), `no label for legacy ${code}`)
  }
  // Two spellings of the same legacy record share one label.
  assert.equal(attendanceLabelKey('LE'), attendanceLabelKey('L/EQ'))
})

test('retired code spellings resolve through their alias', () => {
  for (const [legacy, current] of Object.entries(LEGACY_CODE_ALIASES)) {
    assert.equal(
      attendanceLabelKey(legacy),
      attendanceLabelKey(current),
      `${legacy} should read as ${current}`
    )
  }
})

test('an empty code is the clear-entry wording', () => {
  assert.equal(attendanceLabelKey(''), 'code.CLEAR.label')
  assert.ok(known('code.CLEAR.label'))
})

test('HR stages map onto wording, and the count stays pluralisable', () => {
  assert.equal(attendanceStageTerm(null).key, 'hr.none')
  assert.equal(attendanceStageTerm({ stage: 'formal_action' }).key, 'hr.formalActionNeeded')
  assert.equal(attendanceStageTerm({ stage: 'monitoring' }).key, 'hr.managerTracked')
  // Stage names written before 2026-10-19, still readable.
  assert.equal(attendanceStageTerm({ stage: 'verbal_warning' }).key, 'hr.formalActionNeeded')
  assert.equal(attendanceStageTerm({ stage: 'formal_tracking' }).key, 'hr.managerTracked')
  // Seniority reset is gone. A status still carrying the flag is just a
  // count now, not a conclusion about somebody's standing.
  assert.equal(attendanceStageTerm({ seniorityReset: true, occurrenceCount: 2 }).key, 'hr.occurrences')

  const counted = attendanceStageTerm({ occurrenceCount: 3 })
  assert.equal(counted.key, 'hr.occurrences')
  assert.equal(counted.count, 3)
  assert.ok(known('hr.occurrences.one') && known('hr.occurrences.other'))
})

test('every recognition type and star level maps onto wording', () => {
  for (const type of RECOGNITION_TYPES) {
    assert.ok(known(recognitionLabelKey(type.id)), `no label for ${type.id}`)
    assert.ok(known(recognitionDescriptionKey(type.id)), `no description for ${type.id}`)
  }
  for (const level of STAR_LEVELS) {
    assert.ok(known(starLevelKey(level.id)), `no wording for ${level.id}`)
  }
})

test('every recognition reason maps onto wording', () => {
  for (const reason of ALL_STAR_REASON_OPTIONS) {
    assert.ok(known(reasonKey(reason)), `no wording for ${reason}`)
    assert.ok(known(reasonDescriptionKey(reason)), `no description for ${reason}`)
  }
})

test('an unknown identifier yields no key rather than a broken one', () => {
  assert.equal(recognitionLabelKey('not-a-type'), null)
  assert.equal(starLevelKey(''), null)
  assert.equal(reasonKey(undefined), null)
})
