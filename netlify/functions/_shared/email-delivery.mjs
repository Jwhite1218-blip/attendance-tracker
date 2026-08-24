const RESEND_EMAIL_ENDPOINT = 'https://api.resend.com/emails'

export async function sendResendEmail({
  apiKey,
  from,
  to,
  subject,
  text,
  html,
  idempotencyKey,
  fetchImpl = fetch,
}) {
  if (!apiKey) throw new Error('RESEND_API_KEY is required for report delivery.')
  if (!from) throw new Error('ATTENDANCE_REPORT_FROM is required for report delivery.')
  if (!to) throw new Error('ATTENDANCE_REPORT_TO is required for report delivery.')

  const response = await fetchImpl(RESEND_EMAIL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`Email delivery failed with status ${response.status}: ${body.message || body.name || 'unknown provider error'}`)
  }
  return body
}
