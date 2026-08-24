import { CODE_MAP, normalizeAttendanceCode } from '../../../src/data/attendanceCodes.js'
import { LOCATION_MAP } from '../../../src/data/locations.js'
import {
  BLACKOUTS_KEY,
  CUSTOM_EMPLOYEES_KEY,
  LOCATION_OVERRIDES_KEY,
  RECORD_OVERRIDES_KEY,
} from './permissions.mjs'

export const DEFAULT_REPORT_TIME_ZONE = 'America/Indiana/Indianapolis'
export const DEFAULT_REPORT_HOUR = 17

function employeeKey(employee) {
  return String(employee?.kronos_id || employee?.id || '')
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function normalizedSiteUrl(value) {
  return String(value || '').replace(/\/+$/, '')
}

export function localDateTimeParts(now = new Date(), timeZone = DEFAULT_REPORT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(now)
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return {
    dateKey: `${byType.year}-${byType.month}-${byType.day}`,
    hour: Number(byType.hour),
    weekday: byType.weekday,
  }
}

export function isDailyReportTime(
  now = new Date(),
  { timeZone = DEFAULT_REPORT_TIME_ZONE, hour = DEFAULT_REPORT_HOUR } = {}
) {
  const local = localDateTimeParts(now, timeZone)
  return !['Sat', 'Sun'].includes(local.weekday) && local.hour === Number(hour)
}

export async function loadDailyReportEntries(store, dateKey) {
  const year = String(dateKey).slice(0, 4)
  const fixedKeys = [
    BLACKOUTS_KEY,
    LOCATION_OVERRIDES_KEY,
    RECORD_OVERRIDES_KEY,
    CUSTOM_EMPLOYEES_KEY,
  ]
  const { blobs } = await store.list()
  const attendanceKeys = blobs
    .map(blob => String(blob.key || ''))
    .filter(key => key.startsWith('att-emp-') && key.endsWith(`-${year}`))
  const keys = [...new Set([...fixedKeys, ...attendanceKeys])]
  const rows = await Promise.all(
    keys.map(async key => [key, await store.get(key, { type: 'json' })])
  )
  return Object.fromEntries(rows.filter(([, value]) => value !== null))
}

function effectiveRoster(sourceEmployees, entries) {
  const locationOverrides = entries[LOCATION_OVERRIDES_KEY] || {}
  const recordOverrides = entries[RECORD_OVERRIDES_KEY] || {}
  const customEmployees = Array.isArray(entries[CUSTOM_EMPLOYEES_KEY])
    ? entries[CUSTOM_EMPLOYEES_KEY]
    : []

  return [...sourceEmployees, ...customEmployees]
    .map(employee => {
      const key = employeeKey(employee)
      const override = recordOverrides[key] || {}
      return {
        id: key,
        firstName: String(override.first_name ?? employee.first_name ?? '').trim(),
        lastName: String(override.last_name ?? employee.last_name ?? '').trim(),
        locationId: String(locationOverrides[key] || override.location || employee.location || ''),
      }
    })
    .filter(employee => employee.id)
}

function dateLabel(dateKey, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${dateKey}T12:00:00Z`))
}

function locationName(locationId) {
  return LOCATION_MAP[locationId]?.name || locationId || 'Unknown location'
}

function employeeName(employee) {
  return `${employee.firstName} ${employee.lastName}`.trim() || 'Unknown employee'
}

function reportRows(dateKey, sourceEmployees, entries) {
  return effectiveRoster(sourceEmployees, entries)
    .flatMap(employee => {
      const attendance = entries[`att-emp-${employee.id}-${dateKey.slice(0, 4)}`]?.[dateKey]
      const code = normalizeAttendanceCode(attendance?.code || '')
      const codeInfo = CODE_MAP[code]
      if (!codeInfo) return []
      return [{
        employeeName: employeeName(employee),
        locationId: employee.locationId,
        locationName: locationName(employee.locationId),
        code,
        codeLabel: codeInfo.label,
      }]
    })
    .sort((left, right) => {
      const leftSort = LOCATION_MAP[left.locationId]?.sort ?? Number.MAX_SAFE_INTEGER
      const rightSort = LOCATION_MAP[right.locationId]?.sort ?? Number.MAX_SAFE_INTEGER
      return leftSort - rightSort
        || left.locationName.localeCompare(right.locationName)
        || left.employeeName.localeCompare(right.employeeName)
    })
}

function countBy(rows, field) {
  return rows.reduce((counts, row) => {
    const key = row[field]
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {})
}

function textReport(report) {
  const lines = [
    `End-of-Day Attendance Report — ${report.dateLabel}`,
    '',
    `Attendance exceptions: ${report.totalExceptions}`,
    `Locations affected: ${report.affectedLocations}`,
  ]
  if (!report.rows.length) {
    lines.push('', 'No attendance exceptions were recorded for this date.')
  } else {
    lines.push('', 'Code totals:')
    Object.entries(report.totalsByCode).forEach(([code, total]) => {
      lines.push(`- ${code}: ${total}`)
    })
    lines.push('', 'Details:')
    report.rows.forEach(row => {
      lines.push(`- ${row.locationName} — ${row.employeeName}: ${row.code} (${row.codeLabel})`)
    })
  }
  if (report.siteUrl) lines.push('', `Open the secure tracker: ${report.siteUrl}`)
  lines.push('', 'This automated summary intentionally excludes attendance comments and other employee-card details.')
  return lines.join('\n')
}

function htmlReport(report) {
  const codeTotals = Object.entries(report.totalsByCode)
    .map(([code, total]) => `<li><strong>${escapeHtml(code)}</strong>: ${total}</li>`)
    .join('')
  const detailRows = report.rows
    .map(row => `<tr><td>${escapeHtml(row.locationName)}</td><td>${escapeHtml(row.employeeName)}</td><td><strong>${escapeHtml(row.code)}</strong></td><td>${escapeHtml(row.codeLabel)}</td></tr>`)
    .join('')
  const details = report.rows.length
    ? `<h2 style="font-size:16px;margin:24px 0 8px">Code totals</h2><ul>${codeTotals}</ul><h2 style="font-size:16px;margin:24px 0 8px">Details</h2><table role="presentation" style="border-collapse:collapse;width:100%"><thead><tr><th align="left">Location</th><th align="left">Employee</th><th align="left">Code</th><th align="left">Description</th></tr></thead><tbody>${detailRows}</tbody></table>`
    : '<p><strong>No attendance exceptions were recorded for this date.</strong></p>'
  const siteLink = report.siteUrl
    ? `<p style="margin-top:24px"><a href="${escapeHtml(report.siteUrl)}">Open the secure attendance tracker</a></p>`
    : ''

  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.5"><main style="max-width:760px;margin:0 auto;padding:24px"><h1 style="font-size:22px;margin:0 0 4px">End-of-Day Attendance Report</h1><p style="margin:0 0 24px;color:#4b5563">${escapeHtml(report.dateLabel)}</p><p><strong>${report.totalExceptions}</strong> attendance exception${report.totalExceptions === 1 ? '' : 's'} across <strong>${report.affectedLocations}</strong> location${report.affectedLocations === 1 ? '' : 's'}.</p>${details}${siteLink}<p style="margin-top:28px;color:#6b7280;font-size:12px">This automated summary intentionally excludes attendance comments and other employee-card details. Sign in to the tracker for the complete authorized record.</p></main></body></html>`
}

export function buildDailyAttendanceReport({
  dateKey,
  sourceEmployees = [],
  entries = {},
  siteUrl = '',
  timeZone = DEFAULT_REPORT_TIME_ZONE,
}) {
  const blackout = (Array.isArray(entries[BLACKOUTS_KEY]) ? entries[BLACKOUTS_KEY] : [])
    .find(item => item?.date === dateKey)
  const weekday = new Date(`${dateKey}T12:00:00Z`).getUTCDay()
  const closed = weekday === 0 || weekday === 6 || Boolean(blackout)
  const rows = reportRows(dateKey, sourceEmployees, entries)
  const report = {
    dateKey,
    dateLabel: dateLabel(dateKey, timeZone),
    closed,
    closureLabel: blackout?.label || (weekday === 0 || weekday === 6 ? 'Weekend' : ''),
    rows,
    totalsByCode: countBy(rows, 'code'),
    totalExceptions: rows.length,
    affectedLocations: new Set(rows.map(row => row.locationId)).size,
    siteUrl: normalizedSiteUrl(siteUrl),
  }
  report.subject = `Attendance EOD — ${dateKey} — ${report.totalExceptions} exception${report.totalExceptions === 1 ? '' : 's'}`
  report.text = textReport(report)
  report.html = htmlReport(report)
  return report
}
