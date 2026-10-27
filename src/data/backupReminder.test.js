import test from 'node:test'
import assert from 'node:assert/strict'
import { backupReminder } from './backupReminder.js'

const on = (year, month, day) => new Date(year, month - 1, day, 12, 0, 0)
const iso = (year, month, day) => on(year, month, day).toISOString()

test('somebody who has never exported is told so, whatever the date', () => {
  assert.equal(backupReminder(null, on(2026, 11, 3)).reason, 'never')
  assert.equal(backupReminder('', on(2026, 11, 17)).reason, 'never')
  // An unreadable stored value is the same as none, rather than a crash on
  // the dashboard of the one person who can fix it.
  assert.equal(backupReminder('not a date', on(2026, 11, 17)).reason, 'never')
})

test('nothing is shown in the middle of a month', () => {
  assert.equal(backupReminder(iso(2026, 10, 27), on(2026, 11, 12)), null)
})

test('the reminder appears in the last week of the month', () => {
  assert.equal(backupReminder(iso(2026, 10, 27), on(2026, 11, 23)), null)
  assert.equal(backupReminder(iso(2026, 10, 27), on(2026, 11, 24)).reason, 'month-end')
  assert.equal(backupReminder(iso(2026, 10, 27), on(2026, 11, 30)).reason, 'month-end')
})

// February and the 31sts have to work without a special case.
test('the window is measured from the real end of each month', () => {
  // Last export kept inside the overdue threshold, so this is measuring
  // the month-end window and not the 40-day one.
  //
  // February 2027 has 28 days, so the window is the 22nd to the 28th.
  assert.equal(backupReminder(iso(2027, 1, 25), on(2027, 2, 22)).reason, 'month-end')
  assert.equal(backupReminder(iso(2027, 1, 25), on(2027, 2, 21)), null)
  // December has 31, so the 25th to the 31st.
  assert.equal(backupReminder(iso(2026, 11, 28), on(2026, 12, 25)).reason, 'month-end')
  assert.equal(backupReminder(iso(2026, 11, 28), on(2026, 12, 24)), null)
})

// The point is one a month, not one at month end. Exporting early should
// buy quiet for the rest of the month, or the banner trains her to ignore
// it — which is the only way a reminder actually fails.
test('an export earlier in the month silences the rest of it', () => {
  assert.equal(backupReminder(iso(2026, 11, 3), on(2026, 11, 28)), null)
  assert.equal(backupReminder(iso(2026, 11, 30), on(2026, 11, 30)), null)
})

test('a missed month is caught without waiting for the next month end', () => {
  const reminder = backupReminder(iso(2026, 9, 10), on(2026, 11, 2))
  assert.equal(reminder.reason, 'overdue')
  assert.match(reminder.message, /53 days/)
})

test('overdue wins over month-end, because it is the more urgent thing to say', () => {
  assert.equal(backupReminder(iso(2026, 9, 1), on(2026, 11, 28)).reason, 'overdue')
})

test('the reminder carries the last export date so the banner can show it', () => {
  assert.equal(backupReminder(iso(2026, 10, 27), on(2026, 11, 25)).lastExportedAt, iso(2026, 10, 27))
  assert.equal(backupReminder(null, on(2026, 11, 25)).lastExportedAt, null)
})
