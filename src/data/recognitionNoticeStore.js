// Seen is per login, on this device. Printed is shared kitchen state.
//
// A card marked printed has to clear the queue on every screen the kitchen
// uses, so it goes through the same shared store as recognition itself.
// "I've seen my own recognition" does not: it is one person's news, keyed by
// the employee their login is linked to, and it must survive sign-out (which
// drops managed keys) without becoming a panel for the next person.

import { writeSharedStorage } from './sharedStore.js'
import {
  RECOGNITION_SEEN_STORAGE_KEY,
  STAR_CARD_PRINTS_KEY,
  printMarksFor,
  seenIdsFor,
  withRecognitionSeen,
} from './recognitionNotices.js'

function readObject(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

export function readSeenMap() {
  return readObject(RECOGNITION_SEEN_STORAGE_KEY)
}

export function seenIdsForEmployee(employeeId) {
  return seenIdsFor(readSeenMap(), employeeId)
}

export function markRecognitionSeen(employeeId, recognitionId, at = new Date().toISOString()) {
  const next = withRecognitionSeen(readSeenMap(), employeeId, recognitionId, at)
  localStorage.setItem(RECOGNITION_SEEN_STORAGE_KEY, JSON.stringify(next))
  return next
}

export function readStarCardPrints() {
  return readObject(STAR_CARD_PRINTS_KEY)
}

export function printedStarCardKeys() {
  return Object.keys(readStarCardPrints())
}

export function markStarCardsPrinted(records, options = {}) {
  const marks = printMarksFor(records, options)
  if (!Object.keys(marks).length) return false
  writeSharedStorage(STAR_CARD_PRINTS_KEY, { ...readStarCardPrints(), ...marks })
  return true
}

// Printing from the All-Stars page or an employee card is the same physical
// card. Remembering it must not be able to break that print if this login
// cannot save shared state.
export function rememberStarCardsPrinted(records, options) {
  try {
    return markStarCardsPrinted(records, options)
  } catch {
    return false
  }
}
