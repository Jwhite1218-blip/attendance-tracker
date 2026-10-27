// When to remind Liz to download a backup.
//
// Liz, 2026-10-27, after checking that Supabase takes a daily snapshot and
// keeps about a week of them: "can you set me up a notification at the end
// of each month within it to remind me to export?"
//
// The automatic snapshots cover a database failure. What they do not cover
// is a mistake noticed after the window closes, or losing the Supabase
// project itself — those backups live inside the thing that would be gone.
// Her own downloaded copy is the one that survives both, which is why this
// nags at all.
//
// Pure, so the dates can be tested without waiting for a month to pass.

const END_OF_MONTH_WINDOW_DAYS = 7
// Longer than any month, so a single missed reminder is caught rather than
// waiting for the next end of month. 40 rather than 31 to avoid firing on
// the 1st for somebody who exported on the 1st before.
const OVERDUE_DAYS = 40

function daysRemainingInMonth(today) {
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  return lastDay - today.getDate()
}

function sameMonth(left, right) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth()
}

// Returns null when nothing should be shown, or a reason when it should.
// A reason rather than a bare true, because the banner says something
// different for "you have never done this" than for "it is month end".
export function backupReminder(lastExportedAt, today = new Date()) {
  const parsed = lastExportedAt ? new Date(lastExportedAt) : null
  const last = parsed && Number.isFinite(parsed.valueOf()) ? parsed : null

  if (!last) {
    return {
      reason: 'never',
      message: 'No backup has been downloaded yet.',
      detail: 'Supabase keeps about a week of automatic snapshots. A copy you hold is the one that survives anything longer than that.',
      lastExportedAt: null,
    }
  }

  // Already done this month. The point is one a month, not one at month
  // end, so an early export counts and the banner goes quiet.
  if (sameMonth(last, today)) return null

  const daysSince = Math.floor((today - last) / 86400000)

  if (daysSince >= OVERDUE_DAYS) {
    return {
      reason: 'overdue',
      message: `It has been ${daysSince} days since the last backup.`,
      detail: 'Longer than the automatic snapshots are kept, so anything older than about a week now exists in one place only.',
      lastExportedAt: last.toISOString(),
    }
  }

  // Strictly less than, so the window is exactly the last seven dates of
  // the month — the 24th to the 30th in November, the 25th to the 31st in
  // December — rather than eight.
  if (daysRemainingInMonth(today) < END_OF_MONTH_WINDOW_DAYS) {
    return {
      reason: 'month-end',
      message: 'Time for this month’s backup.',
      detail: 'Takes about thirty seconds. Save it somewhere the district controls, not on this computer alone.',
      lastExportedAt: last.toISOString(),
    }
  }

  return null
}
