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

function nextDateKey(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`)
  date.setDate(date.getDate() + 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Saves one blackout entry per day in [startDate, endDate], inclusive, under one label — e.g.
// blocking out an entire winter or summer break in a single action instead of one day at a
// time. Pass the same date for startDate and endDate to block out a single day.
export function saveBlackoutDateRange(startDate, endDate, label) {
  const normalizedStart = String(startDate || '').trim()
  const normalizedEnd = String(endDate || startDate || '').trim()
  const normalizedLabel = String(label || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedStart)) throw new Error('Choose a valid start date.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedEnd)) throw new Error('Choose a valid end date.')
  if (!normalizedLabel) throw new Error('Add a holiday or closure name.')
  if (normalizedEnd < normalizedStart) throw new Error('End date must be on or after the start date.')

  const dates = []
  for (let cursor = normalizedStart; dates.length <= 366 && cursor <= normalizedEnd; cursor = nextDateKey(cursor)) {
    dates.push(cursor)
  }
  if (dates.length > 366) throw new Error('That range is too long — split it into smaller chunks.')

  const current = readBlackoutDates()
  const byDate = new Map(current.map(item => [item.date, item]))
  dates.forEach(date => byDate.set(date, { date, label: normalizedLabel }))

  saveBlackoutDates([...byDate.values()])
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
