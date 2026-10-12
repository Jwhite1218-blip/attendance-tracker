export const T_SHIRT_SIZE_SUGGESTIONS = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL']

export function normalizeBirthday(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''

  const match = trimmed.match(/^(?:(\d{4})-)?(\d{1,2})[-/](\d{1,2})$/)
  if (!match) throw new Error('Birthday must use MM-DD, without the birth year.')

  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(2000, month - 1, day)
  if (date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error('Enter a valid birthday.')
  }

  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function getBirthdayMonthDay(value) {
  try {
    const normalized = normalizeBirthday(value)
    if (!normalized) return null
    const [month, day] = normalized.split('-').map(Number)
    return { month, day, normalized }
  } catch {
    return null
  }
}

export function formatBirthday(value) {
  const parsed = getBirthdayMonthDay(value)
  if (!parsed) return value || '—'
  return new Date(2000, parsed.month - 1, parsed.day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

// Phone numbers are stored as ten digits and formatted on the way out, so the
// same number typed as "317-555-0134", "(317) 555 0134" or "13175550134" is one
// value in storage and reads the same on every card. A leading country code 1
// is dropped rather than rejected — it is the most common way a number arrives
// off a contact list, and refusing it would just make somebody retype it.
export function normalizePhone(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''

  const digits = trimmed.replace(/\D/g, '')
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (local.length !== 10) {
    throw new Error('Phone number must be 10 digits, for example 317-555-0134.')
  }
  return local
}

export function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length !== 10) return value || '—'
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}
