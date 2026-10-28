// Days worth saying something about when the team signs in.
//
// There was already a celebration banner, but it was pinned to one
// hard-coded date — Indiana Food Day, 23 September — so the mechanism went
// dark the day after and could only come back by editing code. This turns
// it into a short list anybody can add a row to.
//
// Keep it short. A banner that appears most mornings is wallpaper, and the
// fifteen kitchens open at six: whatever is here has to earn the second it
// takes to read.
import { FOOD_DAY_DATE, FOOD_DAY_PATH } from './foodDay.js'

// Warren is in Indianapolis, which does observe daylight saving, so the
// date has to be resolved in that zone rather than the browser's. A
// manager opening the app at 11pm should not see tomorrow's greeting.
const DISTRICT_TIME_ZONE = 'America/Indiana/Indianapolis'

export function districtDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DISTRICT_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

// To add one: a row here, and the two strings it names in i18n.js. `to` is
// inclusive. `path` is optional — without one the banner is a greeting
// rather than a door, which is usually right.
export const CELEBRATIONS = [
  {
    id: 'indiana-food-day',
    from: FOOD_DAY_DATE,
    to: FOOD_DAY_DATE,
    path: FOOD_DAY_PATH,
    tone: 'food-day',
    spark: '✦',
  },
  {
    // Halloween 2026 falls on a Saturday, so the school week ends on the
    // Friday. The banner runs Wednesday to Friday and stops — nobody is in
    // a kitchen on the Saturday to be wished anything.
    id: 'halloween-2026',
    from: '2026-10-28',
    to: '2026-10-30',
    // Points at the All-Star board rather than a page of its own. The fun
    // is better spent pushing somebody toward recognising a teammate than
    // on a page about a pumpkin.
    path: '/recognition',
    tone: 'halloween',
    spark: '🎃',
  },
]

export function activeCelebration(now = new Date()) {
  const today = districtDateKey(now)
  return CELEBRATIONS.find(day => today >= day.from && today <= day.to) || null
}

// Per celebration, so dismissing Halloween does not also silence whatever
// comes next. Per tab as well — sessionStorage — because a banner nobody
// can ever get back is a banner that gets dismissed by accident once and
// is then gone for good.
export function dismissKeyFor(celebration) {
  return `celebration-dismissed-${celebration?.id || 'unknown'}`
}
