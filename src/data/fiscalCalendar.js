// Shared helper for views that can display either a calendar year (Jan-Dec) or a school
// year (Jul-Jun). A school year "startYear" of 2026 means July 2026 through June 2027.

export function getFiscalYearMonths(startYear) {
  const months = []
  for (let monthIdx = 6; monthIdx < 12; monthIdx++) months.push({ year: startYear, monthIdx })
  for (let monthIdx = 0; monthIdx < 6; monthIdx++) months.push({ year: startYear + 1, monthIdx })
  return months
}

export function getCalendarYearMonths(year) {
  const months = []
  for (let monthIdx = 0; monthIdx < 12; monthIdx++) months.push({ year, monthIdx })
  return months
}

export function formatYearLabel(startYear, mode) {
  return mode === 'fiscal' ? `${startYear}–${startYear + 1}` : String(startYear)
}

// Persisted once, shared across every view that offers the calendar/school-year toggle so
// switching it in one place (e.g. the district Calendar View) carries over everywhere else.
const CALENDAR_MODE_KEY = 'attendance-calendar-mode'

export function readCalendarMode() {
  try {
    return localStorage.getItem(CALENDAR_MODE_KEY) === 'fiscal' ? 'fiscal' : 'calendar'
  } catch {
    return 'calendar'
  }
}

export function writeCalendarMode(mode) {
  try {
    localStorage.setItem(CALENDAR_MODE_KEY, mode)
  } catch {
    // Non-fatal — the toggle just won't persist across visits.
  }
}
