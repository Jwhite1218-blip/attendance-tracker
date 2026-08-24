import employees from '../../src/data/employees.json' with { type: 'json' }
import {
  DEFAULT_REPORT_HOUR,
  DEFAULT_REPORT_TIME_ZONE,
  buildDailyAttendanceReport,
  isDailyReportTime,
  loadDailyReportEntries,
  localDateTimeParts,
} from './_shared/daily-report.mjs'
import { sendResendEmail } from './_shared/email-delivery.mjs'
import { getStateStore } from './_shared/state-store.mjs'

function environmentValue(name) {
  return globalThis.Netlify?.env?.get(name) || process.env[name] || ''
}

function reportHour(value) {
  if (String(value || '').trim() === '') return DEFAULT_REPORT_HOUR
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 23
    ? parsed
    : DEFAULT_REPORT_HOUR
}

function enabled(value) {
  return String(value || '').trim().toLowerCase() === 'true'
}

export async function runEndOfDayReport({
  now = new Date(),
  env = environmentValue,
  stateStore,
  sourceEmployees = employees,
  sendEmail = sendResendEmail,
  fetchImpl = fetch,
} = {}) {
  if (!enabled(env('ATTENDANCE_REPORT_ENABLED'))) {
    return { status: 'skipped', reason: 'disabled' }
  }

  const timeZone = env('ATTENDANCE_REPORT_TIME_ZONE') || DEFAULT_REPORT_TIME_ZONE
  const hour = reportHour(env('ATTENDANCE_REPORT_HOUR'))
  if (!isDailyReportTime(now, { timeZone, hour })) {
    return { status: 'skipped', reason: 'outside-delivery-window' }
  }

  const { dateKey } = localDateTimeParts(now, timeZone)
  const store = stateStore || getStateStore()
  const entries = await loadDailyReportEntries(store, dateKey)
  const report = buildDailyAttendanceReport({
    dateKey,
    sourceEmployees,
    entries,
    siteUrl: env('ATTENDANCE_REPORT_SITE_URL'),
    timeZone,
  })

  if (report.closed) {
    return { status: 'skipped', reason: 'district-closed', dateKey, closureLabel: report.closureLabel }
  }

  const delivery = await sendEmail({
    apiKey: env('RESEND_API_KEY'),
    from: env('ATTENDANCE_REPORT_FROM'),
    to: env('ATTENDANCE_REPORT_TO'),
    subject: report.subject,
    text: report.text,
    html: report.html,
    idempotencyKey: `attendance-eod/warren-township/${dateKey}`,
    fetchImpl,
  })

  return {
    status: 'sent',
    dateKey,
    totalExceptions: report.totalExceptions,
    affectedLocations: report.affectedLocations,
    deliveryId: delivery.id || null,
  }
}

export default async () => {
  try {
    const result = await runEndOfDayReport()
    console.log(JSON.stringify({ event: 'end-of-day-attendance-report', ...result }))
  } catch (error) {
    console.error(JSON.stringify({
      event: 'end-of-day-attendance-report-error',
      message: error.message,
    }))
    throw error
  }
}

// Netlify schedules in UTC. Running at both possible UTC equivalents and
// checking Indianapolis local time keeps the delivery at 5:00 PM through DST.
export const config = {
  schedule: '0 21,22 * * 1-5',
}
