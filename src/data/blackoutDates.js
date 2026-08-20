import { writeSharedStorage } from './sharedStore.js'

const STORAGE_KEY = 'attendance-blackout-dates'

function readBlackoutDates() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

function saveBlackoutDates(dates) {
  writeSharedStorage(STORAGE_KEY, dates)
}

export function getBlackoutDates() {
  return readBlackoutDates().sort((a, b) => a.date.localeCompare(b.date))
}

export function getBlackoutDate(date) {
  return readBlackoutDates().find(item => item.date === date) || null
}

export function saveBlackoutDate(date, label) {
  const normalizedDate = String(date || '').trim()
  const normalizedLabel = String(label || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) throw new Error('Choose a valid date.')
  if (!normalizedLabel) throw new Error('Add a holiday or closure name.')

  const current = readBlackoutDates()
  const existingIndex = current.findIndex(item => item.date === normalizedDate)
  const nextRecord = { date: normalizedDate, label: normalizedLabel }

  if (existingIndex >= 0) current[existingIndex] = nextRecord
  else current.push(nextRecord)

  saveBlackoutDates(current)
  return getBlackoutDates()
}

export function removeBlackoutDate(date) {
  saveBlackoutDates(readBlackoutDates().filter(item => item.date !== date))
  return getBlackoutDates()
}

export function isWeekendDate(dateKey) {
  const day = new Date(`${dateKey}T12:00:00`).getDay()
  return day === 0 || day === 6
}

export function getDateAvailability(dateKey) {
  const blackout = getBlackoutDate(dateKey)
  if (blackout) return { unavailable: true, type: 'blackout', label: blackout.label }
  if (isWeekendDate(dateKey)) return { unavailable: true, type: 'weekend', label: 'Weekend' }
  return { unavailable: false, type: null, label: '' }
}
