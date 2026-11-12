import assert from 'node:assert/strict'
import test from 'node:test'

import { clearClientDataCache, configureClientAccess, flushPendingWrites, isManagedStorageKey } from './sharedStore.js'
import { installTestBrowserStorage } from './testBrowserStorage.js'
import { STAR_CARD_PRINTS_KEY as SERVER_PRINTS_KEY } from '../../netlify/functions/_shared/permissions.mjs'
import {
  STAR_CARD_PRINTS_KEY,
  STAR_CARD_TRACKING_SINCE,
  RECOGNITION_SEEN_STORAGE_KEY,
  calendarDateInZone,
  cardsToPrint,
  isNoticeEligible,
  personalRecognitions,
  printKeyFor,
  printMarksFor,
  recognitionRecordedLater,
  seenIdsFor,
  withRecognitionSeen,
} from './recognitionNotices.js'
import { markRecognitionSeen, markStarCardsPrinted, seenIdsForEmployee } from './recognitionNoticeStore.js'

const SINCE = STAR_CARD_TRACKING_SINCE
const AFTER = '2026-11-11T15:00:00.000Z'
const BEFORE = '2026-09-02T15:00:00.000Z'

function record(overrides = {}) {
  return {
    id: 'star-1',
    employeeId: 'emp-lead',
    locationId: 'HawthorneE',
    type: 'star-of-day',
    date: '2026-11-11',
    criteria: ['Teamwork'],
    otherReason: '',
    note: 'Kept the line moving.',
    recognizedBy: 'Elizabeth Schmitt',
    createdAt: AFTER,
    ...overrides,
  }
}

test('a recognition recorded the next calendar day in Warren is delayed', () => {
  // 04:30 UTC is still the evening of the 11th in Indianapolis. 05:30 UTC
  // is 12:30am on the 12th. The shine date is the 11th either way.
  const evening = record({ date: '2026-11-11', createdAt: '2026-11-12T04:30:00.000Z' })
  const afterMidnight = record({ date: '2026-11-11', createdAt: '2026-11-12T05:30:00.000Z' })

  assert.equal(calendarDateInZone(evening.createdAt), '2026-11-11')
  assert.equal(recognitionRecordedLater(evening), false)
  assert.equal(calendarDateInZone(afterMidnight.createdAt), '2026-11-12')
  assert.equal(recognitionRecordedLater(afterMidnight), true)
  assert.equal(isNoticeEligible(record({ createdAt: BEFORE })), false)
  assert.equal(isNoticeEligible(record({ createdAt: SINCE })), true)
})

test('the signed-in person is told about new recognition, and a shared login is not', () => {
  const records = [
    record({ id: 'mine-star', employeeId: 'emp-lead', createdAt: '2026-11-11T15:00:00.000Z', date: '2026-11-09' }),
    record({ id: 'mine-shout', employeeId: 'emp-lead', type: 'star-shout-out', createdAt: '2026-11-11T18:00:00.000Z' }),
    record({ id: 'mine-nomination', employeeId: 'emp-lead', type: 'shooting-star', createdAt: '2026-11-11T12:00:00.000Z' }),
    record({ id: 'mine-buck', employeeId: 'emp-lead', type: 'ace-buck', createdAt: '2026-11-11T11:00:00.000Z' }),
    record({ id: 'old', employeeId: 'emp-lead', createdAt: BEFORE, date: '2026-09-02' }),
    record({ id: 'theirs', employeeId: 'emp-cook', createdAt: AFTER }),
  ]

  const news = personalRecognitions(records, { employeeId: 'emp-lead', seenIds: [] })
  assert.deepEqual(news.map(item => item.id), ['mine-shout', 'mine-star', 'mine-nomination', 'mine-buck'])
  assert.equal(news.find(item => item.id === 'mine-star').recordedLater, true)
  assert.equal(news.find(item => item.id === 'mine-star').recordedOn, '2026-11-11')
  assert.equal(news.find(item => item.id === 'mine-star').recognizer, 'Elizabeth Schmitt')

  const shout = record({
    id: 'from-class',
    type: 'star-shout-out',
    sourceName: 'Ms. Alvarez',
    recognizedBy: 'Ulonda Lewis',
  })
  assert.equal(
    personalRecognitions([shout], { employeeId: 'emp-lead' })[0].recognizer,
    'Ms. Alvarez',
  )

  assert.deepEqual(personalRecognitions(records, { employeeId: 'emp-lead', seenIds: ['mine-star', 'mine-shout'] }).map(item => item.id), [
    'mine-nomination',
    'mine-buck',
  ])
  assert.deepEqual(personalRecognitions(records, { employeeId: '' }), [])
  assert.deepEqual(personalRecognitions(records, { employeeId: null }), [])
})

test('seeing one person\'s recognition does not hide it for someone else', () => {
  const seen = withRecognitionSeen({}, 'emp-lead', 'mine-star', AFTER)
  assert.deepEqual(seenIdsFor(seen, 'emp-lead'), ['mine-star'])
  assert.deepEqual(seenIdsFor(seen, 'emp-cook'), [])
  const both = withRecognitionSeen(seen, 'emp-cook', 'theirs', AFTER)
  assert.deepEqual(seenIdsFor(both, 'emp-lead'), ['mine-star'])
})

test('only unprinted Star of the Day cards for this kitchen are queued', () => {
  const records = [
    record({ id: 'team', employeeId: 'emp-cook', date: '2026-11-10', createdAt: '2026-11-11T16:00:00.000Z' }),
    record({ id: 'lead', employeeId: 'emp-lead', date: '2026-11-09', createdAt: '2026-11-11T15:00:00.000Z' }),
    record({ id: 'shout', employeeId: 'emp-cook', type: 'star-shout-out' }),
    record({ id: 'nomination', employeeId: 'emp-cook', type: 'shooting-star' }),
    record({ id: 'buck', employeeId: 'emp-lead', type: 'ace-buck' }),
    record({ id: 'drawing', employeeId: 'emp-cook', type: 'all-star-of-month' }),
    record({ id: 'old', employeeId: 'emp-cook', createdAt: BEFORE, date: '2026-09-02' }),
    record({ id: 'elsewhere', employeeId: 'emp-other', locationId: 'CrestonMS' }),
    record({ id: 'group-a', employeeId: 'emp-a', groupId: 'lunch', createdAt: '2026-11-11T17:00:00.000Z' }),
    record({ id: 'group-b', employeeId: 'emp-b', groupId: 'lunch', createdAt: '2026-11-11T17:00:00.000Z' }),
  ]
  const names = {
    'emp-cook': 'Melvina Anderson',
    'emp-lead': 'Ulonda Lewis',
    'emp-a': 'Ana Ruiz',
    'emp-b': 'Jose Garcia',
  }

  const cards = cardsToPrint(records, {
    locationId: 'HawthorneE',
    printedKeys: [],
    resolveName: id => names[id] || id,
  })

  assert.deepEqual(cards.map(card => card.printKey), ['group:lunch', 'team', 'shout', 'lead'])
  assert.deepEqual(cards.map(card => card.type), ['star-of-day', 'star-of-day', 'star-shout-out', 'star-of-day'])
  assert.equal(cards.some(card => card.type === 'shooting-star' || card.type === 'ace-buck'), false)
  assert.equal(cards[0].group, true)
  assert.equal(cards[0].name, 'Ana Ruiz, Jose Garcia')
  assert.equal(cards[1].name, 'Melvina Anderson')
  assert.equal(cards[1].recordedLater, true)
  assert.equal(cards[1].recognizedBy, 'Elizabeth Schmitt')
  assert.equal(cards.find(card => card.printKey === 'lead').recordedLater, true)

  const afterPrint = cardsToPrint(records, {
    locationId: 'HawthorneE',
    printedKeys: ['team', 'group:lunch'],
    resolveName: id => names[id] || id,
  })
  assert.deepEqual(afterPrint.map(card => card.printKey), ['shout', 'lead'])

  assert.deepEqual(cardsToPrint(records, { locationId: 'CrestonMS', printedKeys: [] }).map(card => card.printKey), ['elsewhere'])
  assert.equal(printKeyFor(records.find(item => item.id === 'group-a')), 'group:lunch')
  assert.equal(printKeyFor(records.find(item => item.id === 'team')), 'team')
})

test('a printed mark covers a star and a shout-out, and skips a coach buck and a nomination', () => {
  const marks = printMarksFor([
    record({ id: 'group-a', groupId: 'lunch' }),
    record({ id: 'group-b', groupId: 'lunch' }),
    record({ id: 'solo' }),
    record({ id: 'shout', type: 'star-shout-out' }),
    record({ id: 'buck', type: 'ace-buck' }),
    record({ id: 'nomination', type: 'shooting-star' }),
  ], { printedAt: AFTER })

  assert.deepEqual(marks, {
    'group:lunch': { printedAt: AFTER, recognitionIds: ['group-a', 'group-b'] },
    solo: { printedAt: AFTER, recognitionIds: ['solo'] },
    shout: { printedAt: AFTER, recognitionIds: ['shout'] },
  })
})

test('seen stays on this device for that login, and printed is the shared key', async () => {
  installTestBrowserStorage()
  configureClientAccess({ role: 'school', canEditRecognition: true })

  assert.equal(STAR_CARD_PRINTS_KEY, SERVER_PRINTS_KEY)
  assert.equal(isManagedStorageKey(STAR_CARD_PRINTS_KEY), true)
  assert.equal(isManagedStorageKey(RECOGNITION_SEEN_STORAGE_KEY), false)

  markRecognitionSeen('emp-lead', 'mine-star', AFTER)
  markRecognitionSeen('emp-cook', 'theirs', AFTER)
  assert.deepEqual(seenIdsForEmployee('emp-lead'), ['mine-star'])
  assert.deepEqual(seenIdsForEmployee('emp-cook'), ['theirs'])

  assert.equal(markStarCardsPrinted([
    record({ id: 'team', employeeId: 'emp-cook' }),
  ], { printedAt: AFTER }), true)

  const stored = JSON.parse(localStorage.getItem(STAR_CARD_PRINTS_KEY))
  assert.deepEqual(stored.team.recognitionIds, ['team'])
  assert.equal(stored.team.printedAt, AFTER)
  await flushPendingWrites()

  clearClientDataCache()
  assert.equal(localStorage.getItem(STAR_CARD_PRINTS_KEY), null)
  assert.deepEqual(seenIdsForEmployee('emp-lead'), ['mine-star'])
  assert.equal(localStorage.getItem(RECOGNITION_SEEN_STORAGE_KEY) !== null, true)
})
