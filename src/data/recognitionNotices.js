// What a manager should see about recognition the moment they sign in.
//
// Two different kinds of news, kept apart on purpose:
//
//   * "You were recognized" is about the person signed in. A shared kitchen
//     login is not one person, so it gets none of these. Opening or dismissing
//     one is that person's own memory (see recognitionNoticeStore.js) and does
//     not clear it for anyone else.
//
//   * "Cards to print" is a kitchen task. Star of the Day and Warren Star
//     Shout-Out each have a card for the board. A Star Coach Buck is
//     celebrated, not printed, for now. A Shooting Star is a nomination and
//     does not print either. A group award is one card. The card stays until the
//     kitchen prints it or marks it printed, and that mark is shared, so the
//     kitchen computer and a manager's phone agree.
//
// Stars recorded before this tracker existed are treated as already on the
// board. Otherwise the first sign-in after the change would ask every kitchen
// to reprint the school year. From STAR_CARD_TRACKING_SINCE on, a card stays
// until it is printed, however many days that takes.

import { toStarCardEntries } from './recognitionStore.js'

export const STAR_CARD_PRINTS_KEY = 'star-card-prints-v1'

// Device-local. Not a shared state key: signing out clears managed keys and
// must not forget that this person already opened their own news, and another
// login on the same tablet must not inherit it.
export const RECOGNITION_SEEN_STORAGE_KEY = 'recognition-seen-by-login-v1'

// Warren Township is in Indianapolis. A recognition recorded at 11pm local
// and one recorded at 1am the next day are different days, and UTC would get
// that wrong for half the evening.
export const WARREN_TIME_ZONE = 'America/Indiana/Indianapolis'

// Midnight UTC on the day this tracker was agreed. Records created earlier
// are not queued and are not announced as new.
export const STAR_CARD_TRACKING_SINCE = '2026-11-11T00:00:00.000Z'

export const STAR_OF_THE_DAY = 'star-of-day'
export const PRINTABLE_CARD_TYPES = new Set(['star-of-day', 'star-shout-out'])

export function calendarDateInZone(value, timeZone = WARREN_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.valueOf())) return ''
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const read = type => parts.find(part => part.type === type)?.value || ''
  const year = read('year')
  const month = read('month')
  const day = read('day')
  if (!year || !month || !day) return ''
  return `${year}-${month}-${day}`
}

export function isNoticeEligible(record, since = STAR_CARD_TRACKING_SINCE) {
  const created = Date.parse(record?.createdAt || '')
  const start = Date.parse(since)
  return Number.isFinite(created) && Number.isFinite(start) && created >= start
}

// The day they shined (`date`) and the day somebody wrote it down
// (`createdAt`) are different facts. Show both when the kitchen would
// otherwise think the star was for today.
export function recognitionRecordedLater(record, timeZone = WARREN_TIME_ZONE) {
  const shined = String(record?.date || '')
  const recorded = calendarDateInZone(record?.createdAt, timeZone)
  return Boolean(shined && recorded && shined !== recorded)
}

function printableCard(members, resolveName) {
  const type = members[0]?.type
  if (type === STAR_OF_THE_DAY) {
    const card = toStarCardEntries(members, resolveName)[0]
    return card ? { ...card, kind: STAR_OF_THE_DAY } : null
  }
  const names = members.map(record => resolveName(record.employeeId) || String(record.employeeId || ''))
  const first = members[0]
  return {
    kind: type,
    name: names.join(', '),
    ...(names.length > 1 ? { names } : {}),
    date: first.date,
    criteria: first.criteria || [],
    otherReason: first.otherReason || '',
    message: first.note || '',
    recognizedBy: first.recognizedBy || '',
    sourceName: first.sourceName || '',
  }
}

export function printKeyFor(record) {
  const groupId = String(record?.groupId || '').trim()
  if (groupId) return `group:${groupId}`
  return String(record?.id || '')
}

// Every card the given records make, one per physical card — a group award
// is one card naming everybody on it — in the order the records came.
// Star of the Day and the Shout-Out only.
//
// Jon, 2026-11-11: a Shout-Out could be printed from the kitchen queue and
// nowhere else. The feed, the confirmation after saving and the employee
// record all built Star of the Day cards only, so the Shout-Out had no print
// button there at all. Every one of them uses this now, so a Shout-Out prints
// as its certificate wherever a card prints, and never as a star.
export function printableCards(records, resolveName = id => String(id || '')) {
  const groups = new Map()
  for (const record of Array.isArray(records) ? records : []) {
    if (!PRINTABLE_CARD_TYPES.has(record?.type)) continue
    const key = printKeyFor(record)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(record)
  }
  const cards = []
  for (const [printKey, members] of groups) {
    if (new Set(members.map(record => record.type)).size !== 1) continue
    const card = printableCard(members, resolveName)
    if (!card) continue
    cards.push({
      printKey,
      members,
      card: { ...card, recognitionIds: members.map(record => String(record.id)) },
    })
  }
  return cards
}

// The card one recognition belongs to, with everybody else on it when it was
// a group award. Null for a type that does not print.
export function printableCardFor(record, allRecords, resolveName) {
  if (!PRINTABLE_CARD_TYPES.has(record?.type)) return null
  const key = printKeyFor(record)
  const members = (Array.isArray(allRecords) ? allRecords : []).filter(other => printKeyFor(other) === key)
  return printableCards(members.length ? members : [record], resolveName)[0] || null
}

export function withRecognitionSeen(seenMap, employeeId, recognitionId, at) {
  const person = String(employeeId || '').trim()
  const recognition = String(recognitionId || '').trim()
  if (!person || !recognition) return seenMap && typeof seenMap === 'object' ? seenMap : {}
  const current = seenMap && typeof seenMap === 'object' && !Array.isArray(seenMap) ? seenMap : {}
  return {
    ...current,
    [person]: {
      ...(current[person] && typeof current[person] === 'object' ? current[person] : {}),
      [recognition]: at,
    },
  }
}

export function seenIdsFor(seenMap, employeeId) {
  const person = String(employeeId || '').trim()
  if (!person) return []
  const mine = seenMap?.[person]
  if (!mine || typeof mine !== 'object' || Array.isArray(mine)) return []
  return Object.keys(mine)
}

function noticeTiming(record, timeZone) {
  const createdAt = String(record?.createdAt || '')
  const date = String(record?.date || '')
  const recordedOn = calendarDateInZone(createdAt, timeZone)
  return {
    date,
    createdAt,
    recordedOn,
    recordedLater: Boolean(recordedOn && date && recordedOn !== date),
  }
}

// Every kind of recognition, not only the daily star. A nomination and a
// shout-out are still news about that person. Nothing is returned for a
// shared login: there is no employee to be news about.
export function personalRecognitions(records, {
  employeeId,
  seenIds,
  since = STAR_CARD_TRACKING_SINCE,
  timeZone = WARREN_TIME_ZONE,
} = {}) {
  const person = String(employeeId || '').trim()
  if (!person) return []
  const seen = new Set((seenIds || []).map(String))
  return (Array.isArray(records) ? records : [])
    .filter(record => (
      record?.id
      && String(record.employeeId) === person
      && isNoticeEligible(record, since)
      && !seen.has(String(record.id))
    ))
    .map(record => {
      const sourceName = String(record.sourceName || '').trim()
      const recognizedBy = String(record.recognizedBy || '').trim()
      return {
        id: String(record.id),
        type: String(record.type || ''),
        recognizedBy,
        sourceName,
        recognizer: sourceName || recognizedBy,
        criteria: Array.isArray(record.criteria) ? record.criteria.filter(Boolean) : [],
        otherReason: String(record.otherReason || '').trim(),
        note: String(record.note || '').trim(),
        ...noticeTiming(record, timeZone),
      }
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
}

// One entry per physical card for this kitchen. A group award is one entry
// even though it is several recognition records. Printed cards, other
// recognition types, other kitchens, and anything from before the tracker
// are left out.
export function cardsToPrint(records, {
  locationId,
  printedKeys,
  since = STAR_CARD_TRACKING_SINCE,
  timeZone = WARREN_TIME_ZONE,
  resolveName = id => String(id || ''),
} = {}) {
  const kitchen = String(locationId || '').trim()
  if (!kitchen) return []
  const printed = new Set((printedKeys || []).map(String))
  const stars = (Array.isArray(records) ? records : []).filter(record => (
    PRINTABLE_CARD_TYPES.has(record?.type) && isNoticeEligible(record, since)
  ))
  const groups = new Map()
  for (const record of stars) {
    const key = printKeyFor(record)
    if (!key || printed.has(key)) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(record)
  }

  const cards = []
  for (const [printKey, members] of groups) {
    if (!members.some(record => String(record.locationId) === kitchen)) continue
    if (new Set(members.map(record => record.type)).size !== 1) continue
    const card = printableCard(members, resolveName)
    if (!card) continue
    const latest = [...members].sort((left, right) => (
      String(right.createdAt || '').localeCompare(String(left.createdAt || ''))
    ))[0]
    cards.push({
      printKey,
      type: members[0].type,
      recognitionIds: members.map(record => String(record.id)),
      name: card.name,
      recognizedBy: String(members.find(record => String(record.recognizedBy || '').trim())?.recognizedBy || '').trim(),
      group: members.length > 1,
      members,
      card,
      ...noticeTiming(latest, timeZone),
    })
  }

  cards.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.name.localeCompare(right.name))
  return cards
}

// The shape stored under STAR_CARD_PRINTS_KEY. One mark per card, listing the
// recognition records that card covers, so the server can check they belong
// to this kitchen.
export function printMarksFor(records, { printedAt } = {}) {
  const at = printedAt || new Date().toISOString()
  const groups = new Map()
  for (const record of (Array.isArray(records) ? records : [])) {
    if (!PRINTABLE_CARD_TYPES.has(record?.type) || !record.id) continue
    const key = printKeyFor(record)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(String(record.id))
  }
  return Object.fromEntries([...groups.entries()].map(([key, ids]) => [
    key,
    { printedAt: at, recognitionIds: [...new Set(ids)] },
  ]))
}
