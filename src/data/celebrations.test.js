import test from 'node:test'
import assert from 'node:assert/strict'
import { CELEBRATIONS, activeCelebration, dismissKeyFor, districtDateKey } from './celebrations.js'

// Midday UTC so the date is unambiguous in Indianapolis either side of a
// daylight-saving change.
const noon = dateKey => new Date(`${dateKey}T17:00:00Z`)

test('Halloween week greets the school days and stops at the weekend', () => {
  assert.equal(activeCelebration(noon('2026-10-27')), null, 'the day before')
  assert.equal(activeCelebration(noon('2026-10-28'))?.id, 'halloween-2026')
  assert.equal(activeCelebration(noon('2026-10-30'))?.id, 'halloween-2026')
  // 31 October 2026 is a Saturday. Nobody is in a kitchen to be wished
  // anything, so the banner does not run into the weekend.
  assert.equal(activeCelebration(noon('2026-10-31')), null)
})

test('Indiana Food Day is still in the list, as one day', () => {
  assert.equal(activeCelebration(noon('2026-09-23'))?.id, 'indiana-food-day')
  assert.equal(activeCelebration(noon('2026-09-24')), null)
})

test('an ordinary morning gets no banner at all', () => {
  for (const day of ['2026-11-12', '2027-01-15', '2026-08-04']) {
    assert.equal(activeCelebration(noon(day)), null, day)
  }
})

// The district is in Indianapolis, which keeps daylight saving. A manager
// opening the app late at night must not be shown tomorrow's greeting.
test('the day is read in the district timezone, not the browser', () => {
  // 11pm in Indianapolis on the 27th is already the 28th in UTC.
  assert.equal(districtDateKey(new Date('2026-10-28T03:00:00Z')), '2026-10-27')
  assert.equal(activeCelebration(new Date('2026-10-28T03:00:00Z')), null)
  // And a minute past midnight local is the new day.
  assert.equal(districtDateKey(new Date('2026-10-28T04:01:00Z')), '2026-10-28')
})

test('dismissing one celebration does not silence the next', () => {
  const keys = CELEBRATIONS.map(dismissKeyFor)
  assert.equal(new Set(keys).size, keys.length, 'every celebration has its own key')
})

// Each row needs the two strings the banner renders, in both languages.
// Getting this wrong shows a raw key like "celebration.halloween-2026" to
// the whole district on the one morning it is meant to be a nice touch.
test('every celebration has a greeting in both languages', async () => {
  const { translate } = await import('./i18n.js')
  for (const day of CELEBRATIONS) {
    for (const locale of ['en', 'es']) {
      const key = `celebration.${day.id}`
      const text = translate(locale, key)
      assert.notEqual(text, key, `${key} is missing for ${locale}`)
      assert.ok(String(text).trim().length > 0, `${key} is empty for ${locale}`)
    }
  }
})

test('a celebration never ends before it begins', () => {
  for (const day of CELEBRATIONS) {
    assert.ok(day.from <= day.to, `${day.id} ends before it starts`)
    assert.match(day.from, /^\d{4}-\d{2}-\d{2}$/)
    assert.match(day.to, /^\d{4}-\d{2}-\d{2}$/)
  }
})
