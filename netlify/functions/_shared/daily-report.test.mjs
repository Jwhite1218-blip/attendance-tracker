import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDailyAttendanceReport,
  isDailyReportTime,
  localDateTimeParts,
} from './daily-report.mjs'
import { sendResendEmail } from './email-delivery.mjs'
import { runEndOfDayReport } from '../end-of-day-report.mjs'

const reportDate = '2026-08-24'
const sourceEmployees = [
  {
    id: 1,
    kronos_id: '1001',
    first_name: 'Ada',
    last_name: 'Lovelace',
    location: 'CrestonMS',
    pay_amount: 99999,
    birthdate: '12-10',
  },
  {
    id: 2,
    kronos_id: '1002',
    first_name: 'Grace',
    last_name: 'Hopper',
    location: 'WarrenCnHS',
  },
]

function fixtureEntries() {
  return {
    'employee-location-overrides': { 1001: 'BrookViewE' },
    'employee-record-overrides': { 1001: { first_name: 'Ada <Admin>', notes: 'private employee note' } },
    'employee-custom-records': [],
    'attendance-blackout-dates': [],
    'att-emp-1001-2026': {
      [reportDate]: { code: 'UNEX', date: reportDate, note: 'private attendance comment' },
      '2026-08-21': { code: 'LI', date: '2026-08-21' },
    },
    'att-emp-1002-2026': {
      [reportDate]: { code: 'RTO', date: reportDate },
    },
  }
}

test('Indianapolis delivery window remains 5 PM through daylight-saving changes', () => {
  assert.equal(isDailyReportTime(new Date('2026-08-24T21:00:00Z')), true)
  assert.equal(isDailyReportTime(new Date('2026-08-24T22:00:00Z')), false)
  assert.equal(isDailyReportTime(new Date('2026-12-07T22:00:00Z')), true)
  assert.equal(isDailyReportTime(new Date('2026-12-07T21:00:00Z')), false)
  assert.equal(isDailyReportTime(new Date('2026-08-23T21:00:00Z')), false)
  assert.deepEqual(localDateTimeParts(new Date('2026-08-24T21:00:00Z')), {
    dateKey: reportDate,
    hour: 17,
    weekday: 'Mon',
  })
})

test('daily report includes only that date and excludes sensitive free text and unused HR fields', () => {
  const report = buildDailyAttendanceReport({
    dateKey: reportDate,
    sourceEmployees,
    entries: fixtureEntries(),
    siteUrl: 'https://allstartracker.netlify.app/',
  })
  assert.equal(report.totalExceptions, 2)
  assert.equal(report.affectedLocations, 2)
  assert.deepEqual(report.totalsByCode, { UNEX: 1, RTO: 1 })
  assert.match(report.text, /Ada <Admin> Lovelace: UNEX/)
  assert.match(report.html, /Ada &lt;Admin&gt; Lovelace/)
  assert.doesNotMatch(report.text, /private attendance comment|private employee note|99999|12-10/)
  assert.doesNotMatch(report.html, /private attendance comment|private employee note|99999|12-10/)
  assert.equal(report.siteUrl, 'https://allstartracker.netlify.app')
})

test('district blackout dates suppress end-of-day delivery', async () => {
  const entries = fixtureEntries()
  entries['attendance-blackout-dates'] = [{ date: reportDate, label: 'District holiday' }]
  const store = {
    async list() { return { blobs: Object.keys(entries).map(key => ({ key })) } },
    async get(key) { return entries[key] ?? null },
  }
  let sends = 0
  const result = await runEndOfDayReport({
    now: new Date('2026-08-24T21:00:00Z'),
    env: name => ({
      ATTENDANCE_REPORT_ENABLED: 'true',
      ATTENDANCE_REPORT_SITE_URL: 'https://allstartracker.netlify.app',
    })[name] || '',
    stateStore: store,
    sourceEmployees,
    sendEmail: async () => { sends += 1 },
  })
  assert.equal(result.status, 'skipped')
  assert.equal(result.reason, 'district-closed')
  assert.equal(sends, 0)
})

test('disabled clones do not read attendance data or send email', async () => {
  const result = await runEndOfDayReport({
    env: () => '',
    stateStore: { list: async () => { throw new Error('must not read') } },
    sendEmail: async () => { throw new Error('must not send') },
  })
  assert.deepEqual(result, { status: 'skipped', reason: 'disabled' })
})

test('enabled report outside the local delivery window does not read or send', async () => {
  const result = await runEndOfDayReport({
    now: new Date('2026-08-24T20:00:00Z'),
    env: name => name === 'ATTENDANCE_REPORT_ENABLED' ? 'true' : '',
    stateStore: { list: async () => { throw new Error('must not read') } },
    sendEmail: async () => { throw new Error('must not send') },
  })
  assert.deepEqual(result, { status: 'skipped', reason: 'outside-delivery-window' })
})

test('scheduled report sends one idempotent message with the expected safe summary', async () => {
  const entries = fixtureEntries()
  const store = {
    async list() { return { blobs: Object.keys(entries).map(key => ({ key })) } },
    async get(key) { return entries[key] ?? null },
  }
  let message
  const envValues = {
    ATTENDANCE_REPORT_ENABLED: 'true',
    ATTENDANCE_REPORT_TO: 'liz@example.com',
    ATTENDANCE_REPORT_FROM: 'Attendance Tracker <reports@example.com>',
    ATTENDANCE_REPORT_SITE_URL: 'https://allstartracker.netlify.app',
    RESEND_API_KEY: 'test-key',
  }
  const result = await runEndOfDayReport({
    now: new Date('2026-08-24T21:00:00Z'),
    env: name => envValues[name] || '',
    stateStore: store,
    sourceEmployees,
    sendEmail: async payload => {
      message = payload
      return { id: 'email-123' }
    },
  })
  assert.equal(result.status, 'sent')
  assert.equal(result.deliveryId, 'email-123')
  assert.equal(message.to, 'liz@example.com')
  assert.equal(message.idempotencyKey, `attendance-eod/warren-township/${reportDate}`)
  assert.doesNotMatch(message.text, /private attendance comment/)
})

test('Resend adapter supplies the idempotency key and provider-safe payload', async () => {
  let request
  const result = await sendResendEmail({
    apiKey: 'secret',
    from: 'reports@example.com',
    to: 'liz@example.com',
    subject: 'Daily report',
    text: 'Plain text',
    html: '<p>HTML</p>',
    idempotencyKey: 'attendance-eod/test/2026-08-24',
    fetchImpl: async (url, options) => {
      request = { url, options }
      return { ok: true, json: async () => ({ id: 'email-456' }) }
    },
  })
  assert.equal(result.id, 'email-456')
  assert.equal(request.url, 'https://api.resend.com/emails')
  assert.equal(request.options.headers['Idempotency-Key'], 'attendance-eod/test/2026-08-24')
  assert.deepEqual(JSON.parse(request.options.body).to, ['liz@example.com'])
})

test('Resend adapter refuses to call the provider when required configuration is missing', async () => {
  let requests = 0
  await assert.rejects(
    sendResendEmail({
      apiKey: '',
      from: 'reports@example.com',
      to: 'liz@example.com',
      subject: 'Daily report',
      text: 'Plain text',
      html: '<p>HTML</p>',
      idempotencyKey: 'attendance-eod/test/2026-08-24',
      fetchImpl: async () => { requests += 1 },
    }),
    /RESEND_API_KEY is required/
  )
  assert.equal(requests, 0)
})

test('Resend adapter surfaces provider rejection as a failed report run', async () => {
  await assert.rejects(
    sendResendEmail({
      apiKey: 'secret',
      from: 'reports@example.com',
      to: 'liz@example.com',
      subject: 'Daily report',
      text: 'Plain text',
      html: '<p>HTML</p>',
      idempotencyKey: 'attendance-eod/test/2026-08-24',
      fetchImpl: async () => ({
        ok: false,
        status: 403,
        json: async () => ({ message: 'sender domain is not verified' }),
      }),
    }),
    /status 403: sender domain is not verified/
  )
})
