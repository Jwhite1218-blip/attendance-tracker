export const FOOD_DAY_DATE = '2026-09-23'
export const FOOD_DAY_PATH = '/food-day'
export const FOOD_DAY_DISMISSED_KEY = `food-day-dismissed-${FOOD_DAY_DATE}`

export function isFoodDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Indiana/Indianapolis',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}` === FOOD_DAY_DATE
}
