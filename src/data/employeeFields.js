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
